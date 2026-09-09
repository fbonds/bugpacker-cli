/**
 * The MCP server's protocol handling and its scope boundary.
 *
 * Two things are being protected here. The protocol details, because getting them
 * wrong means the tool silently does not work with any client, which is the entire
 * point of the feature. And the scope, because a tool that accepted a filesystem path
 * would let a model read any file the user can.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { writeFileSync, mkdirSync, mkdtempSync, utimesSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { zipSync, strToU8 } from 'fflate'

import { handle, resolveScope, packagesIn, openInScope } from '../dist/mcp.js'
import { KNOWN_SCHEMA_VERSION } from '../dist/report.js'

const FOLDER = 'bugpacker-shop.example.test-2026-09-08-1432'
const report = {
  schemaVersion: KNOWN_SCHEMA_VERSION,
  reportId: 'r1',
  tool: { name: 'Bugpacker', version: '2.0.0' },
  fingerprint: 'f1',
  createdAt: '2026-09-08T14:32:00.000Z',
  page: { url: 'https://shop.example.test/pay', startUrl: 'https://shop.example.test/pay',
          host: 'shop.example.test', path: '/pay', title: 'Pay' },
  recording: { startedAt: '2026-09-08T14:31:00.000Z', durationMs: 60000, navigations: 0,
               reloadedAtStart: true },
  reported: { title: 'Discount ignored', severity: 'major', expected: 'Total drops',
              actual: 'Total unchanged', notes: '' },
  findings: [], traceIds: [], environment: {}, screenshots: [],
  steps: [{ index: 0, ordinal: 1, kind: 'user', text: 'Clicked "Apply"', offsetMs: 10,
            at: '2026-09-08T14:31:10.000Z', repeats: 1, targetSelector: '#apply' }],
  files: [{ name: 'console.log', mime: 'text/plain', bytes: 5, sha256: 'x', role: 'log-console' }],
  archive: { fileCount: 2, totalUncompressedBytes: 5 },
}

function makePackage(dir, name) {
  const path = join(dir, name)
  writeFileSync(path, zipSync({
    [`${FOLDER}/report.json`]: strToU8(JSON.stringify(report)),
    [`${FOLDER}/console.log`]: strToU8('boom\n'),
  }))
  return path
}

const dir = mkdtempSync(join(tmpdir(), 'bp-mcp-'))
mkdirSync(dir, { recursive: true })
const onePath = makePackage(dir, 'one.zip')
makePackage(dir, 'two.zip')

const fileScope = resolveScope(onePath)
const dirScope = resolveScope(dir)
const call = (scope, name, args = {}) =>
  handle(scope, { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }, '0.1.0')

/* ------------------------------------------------------------------- protocol -- */

test('initialize echoes the protocol version the client asked for', () => {
  const res = handle(fileScope, {
    jsonrpc: '2.0', id: 1, method: 'initialize',
    params: { protocolVersion: '2024-11-05' },
  }, '0.1.0')
  assert.equal(res.result.protocolVersion, '2024-11-05')
  assert.deepEqual(res.result.capabilities, { tools: {} })
  assert.equal(res.result.serverInfo.name, 'bugpacker')
})

test('initialize falls back when the client sends no version', () => {
  const res = handle(fileScope, { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }, '0.1.0')
  assert.match(res.result.protocolVersion, /^\d{4}-\d{2}-\d{2}$/)
})

test('notifications get no response at all', () => {
  // Replying to a notification is a protocol error some clients treat as fatal.
  assert.equal(handle(fileScope, { jsonrpc: '2.0', method: 'notifications/initialized' }, '0.1.0'), null)
  assert.equal(handle(fileScope, { jsonrpc: '2.0', method: 'notifications/cancelled' }, '0.1.0'), null)
})

test('an unknown method with an id is an error, without one is silence', () => {
  const asked = handle(fileScope, { jsonrpc: '2.0', id: 9, method: 'nope' }, '0.1.0')
  assert.equal(asked.error.code, -32601)
  assert.equal(handle(fileScope, { jsonrpc: '2.0', method: 'nope' }, '0.1.0'), null)
})

test('ping answers, because clients use it to check the server is alive', () => {
  assert.deepEqual(handle(fileScope, { jsonrpc: '2.0', id: 1, method: 'ping' }, '0.1.0').result, {})
})

/* ---------------------------------------------------------------------- tools -- */

test('list_packages is offered only when serving a directory', () => {
  const forFile = handle(fileScope, { jsonrpc: '2.0', id: 1, method: 'tools/list' }, '0.1.0')
  const forDir = handle(dirScope, { jsonrpc: '2.0', id: 1, method: 'tools/list' }, '0.1.0')
  assert.ok(!forFile.result.tools.some((t) => t.name === 'list_packages'))
  assert.equal(forDir.result.tools[0].name, 'list_packages')
})

test('list_packages gives a size and a date, newest first', () => {
  // Bare names sorted alphabetically put the newest package last, because the name
  // embeds the capture time. An agent had to read the timestamps out of the filenames.
  const older = new Date('2026-09-01T10:00:00Z')
  const newer = new Date('2026-09-08T21:21:00Z')
  utimesSync(join(dir, 'one.zip'), older, older)
  utimesSync(join(dir, 'two.zip'), newer, newer)

  const text = call(dirScope, 'list_packages').result.content[0].text
  const lines = text.split('\n').filter((l) => l.includes('.zip'))
  assert.equal(lines.length, 2)
  assert.match(lines[0], /^two\.zip\s+\d+\s+2026-09-08 /)
  assert.match(lines[1], /^one\.zip\s+\d+\s+2026-09-01 /)
  assert.match(text, /^2 packages, newest first\./)
})

test('every tool declares an object input schema', () => {
  // A malformed schema makes a client drop the tool silently, which is the worst
  // possible failure: the server looks fine and the model just never calls it.
  const { tools } = handle(dirScope, { jsonrpc: '2.0', id: 1, method: 'tools/list' }, '0.1.0').result
  for (const tool of tools) {
    assert.equal(tool.inputSchema.type, 'object', tool.name)
    assert.ok(tool.description.length > 20, tool.name)
  }
})

test('a tool failure is a tool result, not a transport error', () => {
  // The model needs to see the message and correct itself. A JSON-RPC error would be
  // handled by the client instead, and the model would never learn what went wrong.
  const res = call(fileScope, 'nope')
  assert.equal(res.result.isError, true)
  assert.match(res.result.content[0].text, /Unknown tool/)
  assert.equal(res.error, undefined)
})

test('a missing artifact explains itself rather than returning nothing', () => {
  const res = call(fileScope, 'get_network')
  assert.equal(res.result.isError, true)
  assert.match(res.result.content[0].text, /not in this package/)
})

test('tools/call without a name is a protocol error', () => {
  const res = handle(fileScope, { jsonrpc: '2.0', id: 1, method: 'tools/call', params: {} }, '0.1.0')
  assert.equal(res.error.code, -32602)
})

test('describe_bug and get_console read the package', () => {
  assert.match(call(fileScope, 'describe_bug').result.content[0].text, /Discount ignored/)
  assert.match(call(fileScope, 'get_console').result.content[0].text, /boom/)
})

/* ---------------------------------------------------------------------- scope -- */

test('a single-file scope names one package and ignores what is asked for', () => {
  assert.deepEqual(packagesIn(fileScope), ['one.zip'])
  // Even a hostile name cannot redirect a server scoped to one file.
  assert.equal(openInScope(fileScope, '../../etc/passwd').report.reported.title, 'Discount ignored')
})

test('a directory scope lists its packages by name', () => {
  assert.deepEqual(packagesIn(dirScope), ['one.zip', 'two.zip'])
})

test('with several packages and no choice, it asks rather than guessing', () => {
  const res = call(dirScope, 'get_steps')
  assert.equal(res.result.isError, true)
  assert.match(res.result.content[0].text, /one\.zip, two\.zip/)
})

test('a package name cannot escape the directory', () => {
  // basename() strips the path before it is ever joined, so this becomes "passwd"
  // and then fails the membership check.
  const res = call(dirScope, 'get_steps', { package: '../../../etc/passwd' })
  assert.equal(res.result.isError, true)
  assert.match(res.result.content[0].text, /No package named "passwd"/)
})

test('get_file cannot escape the package either', () => {
  const res = call(fileScope, 'get_file', { name: '../../../etc/passwd' })
  assert.equal(res.result.isError, true)
  assert.match(res.result.content[0].text, /passwd is not in this package/)
})

test('naming a package in the directory reads that one', () => {
  assert.match(call(dirScope, 'get_steps', { package: 'two.zip' }).result.content[0].text, /Apply/)
})
