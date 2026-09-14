/**
 * An MCP server over stdio, exposing one package or one directory of them.
 *
 * Written against the protocol rather than the official SDK. That SDK pulls express,
 * hono, cors, jose and eventsource to support HTTP and OAuth transports, none of which
 * a stdio tools-only server touches, and this package has one dependency today. The
 * surface actually needed here is four methods of JSON-RPC 2.0, which is small enough
 * to own and test directly.
 *
 * **Nothing may write to stdout except protocol messages.** stdout *is* the transport,
 * so one stray console.log corrupts the stream and the client disconnects with no
 * useful error. Diagnostics go to stderr, which the client ignores.
 *
 * The agent never supplies a filesystem path. The scope is fixed when the server is
 * launched, by the person launching it, and tools address packages by name within it.
 * A tool that took a path would let a model read any file the user can.
 */

import { readdirSync, statSync } from 'node:fs'
import { join, basename } from 'node:path'
import { createInterface } from 'node:readline'
import { openPackage } from './package.js'
import type { BugPackage } from './package.js'
import { show } from './commands/show.js'
import { steps, files } from './commands/artifacts.js'
import { validate as validateChecks, renderChecks } from './commands/validate.js'

/**
 * Echoed back to the client rather than asserted.
 *
 * A tools-only server's semantics have been stable across protocol revisions, so
 * agreeing with whatever the client asked for is more compatible than refusing a
 * version string this build has not heard of. If the negotiation ever grows teeth,
 * this is the line that has to change.
 */
const FALLBACK_PROTOCOL = '2025-06-18'

interface Rpc {
  jsonrpc: '2.0'
  id?: string | number | null
  method?: string
  params?: Record<string, unknown>
}

export interface Scope {
  /** A single package, or null when serving a directory. */
  file: string | null
  /** A directory of packages, or null when serving one file. */
  dir: string | null
}

export function resolveScope(target: string): Scope {
  const stat = statSync(target)
  return stat.isDirectory() ? { file: null, dir: target } : { file: target, dir: null }
}

/** Package names in scope. Names, never paths: the agent gets no filesystem vocabulary. */
export function packagesIn(scope: Scope): string[] {
  if (scope.file) return [basename(scope.file)]
  return readdirSync(scope.dir!)
    .filter((name) => name.endsWith('.zip'))
    .sort()
}

export interface PackageRow {
  name: string
  bytes: number
  modified: Date
}

/**
 * The same names, with enough to tell them apart, newest first.
 *
 * Bare names were not enough. Package names embed the capture time, so sorting them
 * alphabetically puts the newest one last, and an agent asked about "the bug I just
 * captured" had to read twenty timestamps out of twenty filenames and hope. One did
 * exactly that, got it right, and said it was guessing.
 *
 * The timestamp is the file's own, from stat, rather than the one inside report.json.
 * Reading the real capture time means opening and inflating every archive in the
 * directory to answer a question about which one to open, and for a package written
 * once at export the two agree.
 */
export function packageRows(scope: Scope): PackageRow[] {
  const dir = scope.dir
  const rows = packagesIn(scope).map((name) => {
    const stat = statSync(dir ? join(dir, name) : scope.file!)
    return { name, bytes: stat.size, modified: stat.mtime }
  })
  return rows.sort((a, b) => b.modified.getTime() - a.modified.getTime())
}

/** Local time, to agree with the timestamps the extension puts in the filenames. */
function stamp(at: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  return (
    `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())} ` +
    `${pad(at.getHours())}:${pad(at.getMinutes())}`
  )
}

export function renderPackages(scope: Scope): string {
  const rows = packageRows(scope)
  if (!rows.length) return 'No .zip packages in this directory.'
  const width = Math.max(...rows.map((r) => r.name.length))
  const head = `${rows.length} package${rows.length === 1 ? '' : 's'}, newest first.`
  const body = rows.map(
    (r) => `${r.name.padEnd(width)} ${String(r.bytes).padStart(9)}  ${stamp(r.modified)}`,
  )
  return [head, '', ...body].join('\n')
}

/**
 * A name from the agent becomes a path here, and only here.
 *
 * basename() strips any directory part before it is joined, so a name of
 * "../../etc/passwd" resolves inside the scope directory and then fails to open,
 * rather than escaping it.
 */
export function openInScope(scope: Scope, name?: string): BugPackage {
  if (scope.file) return openPackage(scope.file)
  const available = packagesIn(scope)
  if (!name) {
    if (available.length === 1) return openPackage(join(scope.dir!, available[0]!))
    throw new Error(
      `This server is serving ${available.length} packages. Pass "package" as one of: ${available.join(', ')}`,
    )
  }
  const safe = basename(name)
  if (!available.includes(safe)) {
    throw new Error(`No package named "${safe}" here. Available: ${available.join(', ')}`)
  }
  return openPackage(join(scope.dir!, safe))
}

interface Tool {
  name: string
  description: string
  inputSchema: {
    type: 'object'
    properties: Record<string, { type: string; description?: string }>
    required?: string[]
  }
}

const PACKAGE_ARG = {
  package: {
    type: 'string',
    description: 'Which package, by name. Omit when the server is serving only one.',
  },
} as const

function tools(scope: Scope): Tool[] {
  const list: Tool[] = [
    {
      name: 'describe_bug',
      description:
        'The whole bug report, summarised: what was reported, the steps to reproduce it, ' +
        'what the capture noticed, server correlation ids, and what the package contains. ' +
        'Start here.',
      inputSchema: { type: 'object', properties: { ...PACKAGE_ARG } },
    },
    {
      name: 'get_steps',
      description: 'Just the steps to reproduce, with expected and actual result.',
      inputSchema: { type: 'object', properties: { ...PACKAGE_ARG } },
    },
    {
      name: 'get_console',
      description:
        'Console output, uncaught errors and CSP violations, timestamped from the start ' +
        'of the recording.',
      inputSchema: { type: 'object', properties: { ...PACKAGE_ARG } },
    },
    {
      name: 'get_network',
      description:
        'Failed requests, kept separate from requests an ad blocker stopped before they ' +
        'left the browser. The two mean different things and only one is a defect.',
      inputSchema: { type: 'object', properties: { ...PACKAGE_ARG } },
    },
    {
      name: 'list_files',
      description: 'Everything in the package, with sizes and roles.',
      inputSchema: { type: 'object', properties: { ...PACKAGE_ARG } },
    },
    {
      name: 'get_file',
      description:
        'One text artifact from the package by name, such as page-snapshot.html, ' +
        'form-state.json or network.har. Use list_files to see what is there.',
      inputSchema: {
        type: 'object',
        properties: {
          ...PACKAGE_ARG,
          name: { type: 'string', description: 'The artifact name, as list_files reports it.' },
        },
        required: ['name'],
      },
    },
    {
      name: 'validate',
      description:
        'Check that a package is intact and internally consistent: every file matches ' +
        'the SHA-256 and byte length report.json records for it, the inventory agrees ' +
        'both ways, and the report agrees with itself. Use it before trusting a package ' +
        'somebody sent you. It is not schema validation.',
      inputSchema: { type: 'object', properties: { ...PACKAGE_ARG } },
    },
  ]
  if (scope.dir) {
    list.unshift({
      name: 'list_packages',
      description:
        'The bug packages this server is serving, newest first, with the size and ' +
        'timestamp of each. Use the name in the "package" argument of the other tools.',
      inputSchema: { type: 'object', properties: {} },
    })
  }
  return list
}

function callTool(scope: Scope, name: string, args: Record<string, unknown>): string {
  const which = typeof args.package === 'string' ? args.package : undefined

  if (name === 'list_packages') return renderPackages(scope)

  const pkg = openInScope(scope, which)
  switch (name) {
    case 'describe_bug':
      return show(pkg)
    case 'get_steps':
      return steps(pkg)
    case 'get_console':
      return textOr(pkg, 'console.log')
    case 'get_network':
      return textOr(pkg, 'network-errors.log')
    case 'list_files':
      return files(pkg)
    case 'validate':
      return renderChecks(pkg, validateChecks(pkg))
    case 'get_file': {
      if (typeof args.name !== 'string') throw new Error('get_file needs a "name".')
      return textOr(pkg, basename(args.name))
    }
    default:
      throw new Error(`Unknown tool: ${name}`)
  }
}

function textOr(pkg: BugPackage, name: string): string {
  const text = pkg.readText(name)
  if (text === undefined) {
    // Absence is ordinary: the reporter can exclude any artifact before exporting.
    // Saying so stops an agent concluding the page was quiet when it was not asked.
    throw new Error(`${name} is not in this package. Call list_files to see what is.`)
  }
  return text
}

export function handle(scope: Scope, message: Rpc, version: string): object | null {
  const reply = (result: object) => ({ jsonrpc: '2.0' as const, id: message.id, result })
  const error = (code: number, msg: string) => ({
    jsonrpc: '2.0' as const,
    id: message.id,
    error: { code, message: msg },
  })

  switch (message.method) {
    case 'initialize': {
      const asked = message.params?.protocolVersion
      return reply({
        protocolVersion: typeof asked === 'string' ? asked : FALLBACK_PROTOCOL,
        capabilities: { tools: {} },
        serverInfo: { name: 'bugpacker', version },
      })
    }
    // Notifications carry no id and get no response. Replying to one is a protocol
    // error that some clients treat as fatal.
    case 'notifications/initialized':
    case 'notifications/cancelled':
      return null
    case 'ping':
      return reply({})
    case 'tools/list':
      return reply({ tools: tools(scope) })
    case 'tools/call': {
      const name = message.params?.name
      if (typeof name !== 'string') return error(-32602, 'tools/call needs a tool name.')
      const args = (message.params?.arguments as Record<string, unknown>) ?? {}
      try {
        return reply({ content: [{ type: 'text', text: callTool(scope, name, args) }] })
      } catch (e) {
        // Reported as a tool result rather than a JSON-RPC error, so the model sees the
        // message and can correct itself instead of the client treating it as a
        // transport failure.
        return reply({
          content: [{ type: 'text', text: (e as Error).message }],
          isError: true,
        })
      }
    }
    default:
      if (message.id === undefined) return null
      return error(-32601, `Unknown method: ${message.method}`)
  }
}

export function serve(scope: Scope, version: string): void {
  const send = (payload: object) => process.stdout.write(`${JSON.stringify(payload)}\n`)
  const lines = createInterface({ input: process.stdin })

  lines.on('line', (line) => {
    const trimmed = line.trim()
    if (!trimmed) return
    let parsed: unknown
    try {
      parsed = JSON.parse(trimmed)
    } catch {
      send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })
      return
    }
    // `null`, `42`, `"x"` and `[]` are all valid JSON and none of them is a request.
    // Reading .method off null threw and ended the process, taking the agent's connection
    // with it; the rest fell through to a silent no-reply, which is its own kind of wrong.
    // The spec has a code for exactly this, so send it rather than swallowing the line.
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      send({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid Request' } })
      return
    }
    const message = parsed as Rpc
    // Nothing a client sends may end the session. handle() reaches the filesystem for
    // tools/list and for every tool call, so an unexpected throw is not hypothetical, and
    // uncaught here it costs the whole transport rather than the one call that caused it.
    let response: object | null
    try {
      response = handle(scope, message, version)
    } catch (e) {
      send({
        jsonrpc: '2.0',
        id: message.id ?? null,
        error: { code: -32603, message: (e as Error).message },
      })
      return
    }
    if (response) send(response)
  })
}
