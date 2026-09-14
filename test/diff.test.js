/**
 * Comparing two captures.
 *
 * The property most worth protecting here is not any single difference the command
 * finds. It is that a section reports the kind of comparison it actually did. A reader
 * who is told "structured" when the tool only compared lines of text will believe a
 * conclusion the package does not support, and that is the failure this file exists to
 * prevent.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { writeFileSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { zipSync, strToU8 } from 'fflate'

import { openPackage } from '../dist/package.js'
import { diff, renderDiff } from '../dist/commands/diff.js'
import { KNOWN_SCHEMA_VERSION } from '../dist/report.js'

const dir = mkdtempSync(join(tmpdir(), 'bp-diff-'))
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
let seq = 0

const har = (entries) => ({ log: { version: '1.2', entries } })
const entry = (method, url, status, ok = true) => ({
  request: { method, url, queryString: [] },
  response: { status },
  _bugpacker: { ok },
})

/** A package with whatever artifacts and report fields the caller asks for. */
function build(opts = {}) {
  const host = opts.host ?? 'shop.example.test'
  const folder = `bugpacker-${host}-2026-09-08-1432`
  const artifacts = {
    'console.log': strToU8(opts.consoleLog ?? '[+00:01.000] ERROR boom\n'),
    'environment.json': strToU8(JSON.stringify(opts.environment ?? { browser: 'Chrome', colorScheme: 'light' })),
    'network.har': strToU8(JSON.stringify(har(opts.har ?? []))),
    ...(opts.extra ?? {}),
  }
  const files = Object.entries(artifacts).map(([n, bytes]) => ({
    name: n, mime: 'text/plain', bytes: bytes.length, sha256: sha256(bytes), role: 'x', derived: true,
  }))
  const report = {
    schemaVersion: KNOWN_SCHEMA_VERSION,
    reportId: `r${seq}`,
    tool: { name: 'Bugpacker', version: '2.0.2' },
    fingerprint: 'f1',
    createdAt: '2026-09-08T14:32:00.000Z',
    page: { url: `https://${host}/pay`, startUrl: `https://${host}/pay`, host, path: '/pay', title: 'Pay' },
    recording: { startedAt: '2026-09-08T14:31:00.000Z', durationMs: 1, navigations: 0, reloadedAtStart: true },
    reported: { title: 'T', severity: 'major', expected: 'e', actual: 'a', notes: '' },
    steps: opts.steps ?? [],
    files,
    counts: opts.counts ?? { errors: 0 },
    ...(opts.reportExtra ?? {}),
  }
  const zip = { [`${folder}/report.json`]: strToU8(JSON.stringify(report)) }
  for (const [n, bytes] of Object.entries(artifacts)) zip[`${folder}/${n}`] = bytes
  const path = join(dir, `p${seq++}.zip`)
  writeFileSync(path, zipSync(zip))
  return openPackage(path)
}

const section = (sections, title) => sections.find((s) => s.title === title)
const changed = (sections) => sections.filter((s) => s.lines.length > 0).map((s) => s.title).sort()

test('two identical captures report no differences', () => {
  assert.deepEqual(changed(diff(build(), build())), [])
})

/* ------------------------------------------------- the resolver property -- */

test('the console output section says text when the report carries no console array', () => {
  const s = section(diff(build(), build()), 'Console output')
  assert.equal(s.kind, 'text')
  assert.equal(s.source, 'console.log')
})

test('the same section says structured when the report carries a console array', () => {
  // The format change that has not been made. Nothing in diff.ts is written for this
  // array: the resolver looks for it, does not find it today, and finds it here. If the
  // kind were a literal anywhere, this is the assertion that would fail.
  const withConsole = { console: [{ level: 'warn', text: 'slow' }] }
  const a = build({ reportExtra: withConsole })
  const b = build({ reportExtra: withConsole })
  const s = section(diff(a, b), 'Console output')
  assert.equal(s.kind, 'structured')
  assert.equal(s.source, 'report.json console[]')
})

test('a structured console diffs entries, and one added entry is one line', () => {
  const a = build({ reportExtra: { console: [{ level: 'warn', text: 'slow' }] } })
  const b = build({ reportExtra: { console: [{ level: 'warn', text: 'slow' }, { level: 'log', text: 'new' }] } })
  const s = section(diff(a, b), 'Console output')
  assert.equal(s.kind, 'structured')
  assert.equal(s.lines.length, 1)
  assert.match(s.lines[0], /^\+ /)
})

test('one side carrying a console array is not enough to call it structured', () => {
  // Comparing a structured console against a rendered one is not a structured
  // comparison, and claiming it would be the exact overstatement this guards.
  const a = build({ reportExtra: { console: [{ level: 'warn', text: 'slow' }] } })
  const s = section(diff(a, build()), 'Console output')
  assert.equal(s.kind, 'text')
})

test('the rendered output groups text sections apart from structured ones', () => {
  const a = build()
  const text = renderDiff(a, build(), diff(a, build()))
  assert.match(text, /Compared field by field/)
  assert.match(text, /Compared as text/)
  assert.ok(
    text.indexOf('Compared field by field') < text.indexOf('Compared as text'),
    'structured sections come first',
  )
  assert.match(text, /\[text, from console\.log\]/)
  assert.match(text, /\[structured, from report\.json steps\[kind=system\]\]/)
})

/* --------------------------------------------------------------- network -- */

test('a request that started failing is reported', () => {
  const a = build({ har: [entry('GET', 'https://api.example.test/pay', 200)] })
  const b = build({ har: [entry('GET', 'https://api.example.test/pay', 500)] })
  const lines = section(diff(a, b), 'Network').lines
  assert.equal(lines.length, 1)
  assert.match(lines[0], /status 200 -> 500/)
})

test('a request that stopped reaching a server is reported', () => {
  const a = build({ har: [entry('GET', 'https://api.example.test/pay', 0, true)] })
  const b = build({ har: [entry('GET', 'https://api.example.test/pay', 0, false)] })
  assert.match(section(diff(a, b), 'Network').lines[0], /reached a server: true -> false/)
})

test('a new request and a vanished one are reported', () => {
  const a = build({ har: [entry('GET', 'https://api.example.test/one', 200)] })
  const b = build({ har: [entry('GET', 'https://api.example.test/two', 200)] })
  const lines = section(diff(a, b), 'Network').lines
  assert.deepEqual(lines.map((l) => l[0]).sort(), ['+', '-'])
})

test('two requests differing only in query are matched together, not reported as new', () => {
  // A consequence of redaction rewriting scrubbed queries, not a shortcut. The command
  // says so in its own note; this asserts the behaviour that note describes.
  const a = build({ har: [entry('GET', 'https://api.example.test/pay?token=aaa', 200)] })
  const b = build({ har: [entry('GET', 'https://api.example.test/pay?token=bbb', 200)] })
  assert.deepEqual(section(diff(a, b), 'Network').lines, [])
})

test('a change in the number of redacted parameters is a difference', () => {
  // It means the query changed, even though what changed is not in the package.
  // Suppressing it would hide a real change behind an artifact of redaction.
  const a = build({ har: [entry('GET', 'https://t.example.test/c?… (2 parameters removed)', 0, false)] })
  const b = build({ har: [entry('GET', 'https://t.example.test/c?… (3 parameters removed)', 0, false)] })
  const lines = section(diff(a, b), 'Network').lines
  assert.equal(lines.length, 1)
  assert.match(lines[0], /redacted query parameters: 2 -> 3/)
})

test('the network note explains why the match is loose, not only that it is', () => {
  const note = section(diff(build(), build()), 'Network').note
  assert.match(note, /redaction/)
  assert.match(note, /not a stable key/)
  assert.match(note, /nothing in this tool can make it one/)
})

/* ----------------------------------------------------------- other parts -- */

test('every environment difference is listed, including the boring ones', () => {
  const a = build({ environment: { browser: 'Chrome', browserVersion: '152', colorScheme: 'light' } })
  const b = build({ environment: { browser: 'Chrome', browserVersion: '153', colorScheme: 'dark' } })
  assert.deepEqual(section(diff(a, b), 'Environment').lines, [
    'browserVersion: "152"  ->  "153"',
    'colorScheme: "light"  ->  "dark"',
  ])
})

test('nested objects report the properties that changed, not both blocks', () => {
  const a = build({ environment: { viewport: { width: 1990, height: 1200 } } })
  const b = build({ environment: { viewport: { width: 894, height: 1200 } } })
  assert.deepEqual(section(diff(a, b), 'Environment').lines, ['viewport.width: 1990  ->  894'])
})

test('console errors come from the report, so they compare structurally', () => {
  const step = (text) => ({ index: 0, ordinal: null, kind: 'system', text, offsetMs: 0, at: 'x', repeats: 1 })
  const a = build({ steps: [step('Console error: one')] })
  const b = build({ steps: [step('Console error: one'), step('Console error: two')] })
  const s = section(diff(a, b), 'Console errors')
  assert.equal(s.kind, 'structured')
  assert.deepEqual(s.lines, ['+ Console error: two'])
})

test('log timestamps are ignored, so an identical line is not a difference', () => {
  const a = build({ consoleLog: '[+00:01.000] ERROR boom\n' })
  const b = build({ consoleLog: '[+00:09.999] ERROR boom\n' })
  assert.deepEqual(section(diff(a, b), 'Console output').lines, [])
})

test('captures of different hosts are compared, with the mismatch said out loud', () => {
  const a = build({ host: 'staging.example.test' })
  const b = build({ host: 'www.example.test' })
  const text = renderDiff(a, b, diff(a, b))
  assert.match(text, /captures of different hosts, staging\.example\.test and www\.example\.test/)
})

test('a long value is truncated with its full length, not silently cut', () => {
  const long = 'x'.repeat(400)
  const a = build({ environment: { note: long } })
  const b = build({ environment: { note: 'short' } })
  assert.match(section(diff(a, b), 'Environment').lines[0], /\.\.\. \(\d{3} chars\)/)
})

test('every section declares a kind and a source', () => {
  for (const s of diff(build(), build())) {
    assert.ok(s.kind === 'structured' || s.kind === 'text', `${s.title} has kind ${s.kind}`)
    assert.ok(s.source.length > 0, `${s.title} has no source`)
  }
})
