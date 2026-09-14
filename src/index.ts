#!/usr/bin/env node
/**
 * bugpacker-cli
 *
 * Reads a Bugpacker package from disk. It opens a local file and prints; it makes no
 * network request of any kind, which is the point of the tool rather than a detail of
 * it: the package it reads never left the machine, and neither does anything here.
 */

import { readFileSync } from 'node:fs'
import { openPackage } from './package.js'
import { show } from './commands/show.js'
import { steps, artifact, files, extract } from './commands/artifacts.js'
import { validate, passed, renderChecks, checksAsJson } from './commands/validate.js'
import { serve, resolveScope } from './mcp.js'
import { parseArgs } from './args.js'

const USAGE = `bugpacker <command> <package.zip>

  show              everything, summarised
  steps             repro steps, expected and actual
  console           console output, uncaught errors and CSP violations
  network           failed requests, kept apart from ad-blocked noise
  har               the full session as HAR, for a HAR viewer
  files             what is in the package
  validate          check the package is what report.json describes
                      --json        machine-readable, for CI
  json              report.json, for piping into something else
  extract [name]    write an artifact to disk, or all of them
                      --out <dir>   where to write, default the current directory

  mcp <path>        serve over stdio for a coding agent. <path> is one package or a
                    directory of them, and fixes what the agent can reach.

  --help            this
  --version         the installed version

Reads a local file and prints. Makes no network requests.
https://bugpacker.com`

function fail(message: string): never {
  process.stderr.write(`${message}\n`)
  process.exit(1)
}

/** Read from the installed package, so it cannot drift from what npm put on disk. */
function installedVersion(): string {
  const url = new URL('../package.json', import.meta.url)
  return (JSON.parse(readFileSync(url, 'utf8')) as { version: string }).version
}

function main(argv: string[]): void {
  const args = argv.slice(2)

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    process.stdout.write(`${USAGE}\n`)
    return
  }
  if (args[0] === '--version' || args[0] === '-v') {
    process.stdout.write(`${installedVersion()}\n`)
    return
  }

  let parsed
  try {
    parsed = parseArgs(args)
  } catch (error) {
    fail(`${(error as Error).message}\n\n${USAGE}`)
  }
  const { command, positional, flags, switches } = parsed
  const target = positional[0]
  if (!target) fail(`${command} needs a package.\n\n${USAGE}`)

  if (command === 'mcp') {
    try {
      // stdout is the transport from here on. Nothing else may write to it.
      serve(resolveScope(target), installedVersion())
    } catch (error) {
      fail((error as Error).message)
    }
    return
  }

  let pkg
  try {
    pkg = openPackage(target)
  } catch (error) {
    // validate has a CI contract and needs these apart: 1 means the package opened and
    // is not what report.json describes, 2 means there was nothing here to check. A
    // wrong path and a tampered capture should not look the same to a build. Every
    // other command has no such contract and keeps the single failure code.
    if (command === 'validate') {
      process.stderr.write(`${(error as Error).message}\n`)
      process.exit(2)
    }
    fail((error as Error).message)
  }

  const write = (text: string): void => {
    process.stdout.write(text.length ? `${text}\n` : '')
  }

  try {
    switch (command) {
      case 'show':
        return write(show(pkg))
      case 'steps':
        return write(steps(pkg))
      case 'console':
        return write(artifact(pkg, 'console.log'))
      case 'network':
        return write(artifact(pkg, 'network-errors.log'))
      case 'har':
        return write(artifact(pkg, 'network.har'))
      case 'files':
        return write(files(pkg))
      case 'validate': {
        const checks = validate(pkg)
        write(switches.has('json') ? checksAsJson(pkg, checks) : renderChecks(pkg, checks))
        // Exit 1 on failure, 2 is openPackage refusing the file, which happened earlier
        // if it was going to. Warnings deliberately leave this at 0.
        if (!passed(checks)) process.exit(1)
        return
      }
      case 'json':
        return write(JSON.stringify(pkg.report, null, 2))
      case 'extract':
        return write(extract(pkg, flags.get('out') ?? '.', positional[1]))
      default:
        fail(`Unknown command: ${command}\n\n${USAGE}`)
    }
  } catch (error) {
    fail((error as Error).message)
  }
}

main(process.argv)
