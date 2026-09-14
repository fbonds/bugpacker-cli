/**
 * The commands that reach into a package for one thing.
 *
 * `extract` gets the most attention, because it is the only thing here that writes to
 * disk, and a name inside an archive is a path the moment anything does that.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { writeFileSync, mkdirSync, mkdtempSync, existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { zipSync, strToU8 } from 'fflate'

import { openPackage } from '../dist/package.js'
import { steps, artifact, files, extract, undigestedRole, failedOnly } from '../dist/commands/artifacts.js'
import { KNOWN_SCHEMA_VERSION } from '../dist/report.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const FIXTURES = join(HERE, 'fixtures')
mkdirSync(FIXTURES, { recursive: true })
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
  findings: [],
  steps: [
    { index: 0, ordinal: 1, kind: 'user', text: 'Clicked "Apply" (#apply)', offsetMs: 10,
      at: '2026-09-08T14:31:10.000Z', repeats: 1, targetSelector: '#apply' },
    { index: 1, ordinal: null, kind: 'system', text: 'Console error: boom', offsetMs: 20,
      at: '2026-09-08T14:31:20.000Z', repeats: 1, targetSelector: null },
  ],
  traceIds: [],
  environment: {},
  screenshots: [],
  files: [{ name: 'console.log', mime: 'text/plain', bytes: 6, sha256: 'x', role: 'log-console' }],
  archive: { fileCount: 3, totalUncompressedBytes: 6 },
}

const path = join(FIXTURES, 'artifacts.zip')
writeFileSync(path, zipSync({
  [`${FOLDER}/report.json`]: strToU8(JSON.stringify(report)),
  [`${FOLDER}/console.log`]: strToU8('boom\n'),
  [`${FOLDER}/nested/network.har`]: strToU8('{"log":{}}'),
}))
const pkg = openPackage(path)

test('steps numbers actions and indents consequences', () => {
  const text = steps(pkg)
  assert.match(text, /^ 1\. Clicked "Apply" \(#apply\)$/m)
  assert.match(text, /^ {4}Console error: boom$/m)
  // The text the extension rendered already carries the selector; appending it again
  // was a real bug, so it is asserted against rather than left to be re-introduced.
  assert.equal(text.match(/#apply/g).length, 1)
})

test('steps carries expected and actual, which is the whole point of a report', () => {
  const text = steps(pkg)
  assert.match(text, /Expected: Total drops/)
  assert.match(text, /Actual: {3}Total unchanged/)
})

test('an artifact is printed as the extension rendered it', () => {
  assert.equal(artifact(pkg, 'console.log'), 'boom')
})

test('a missing artifact explains itself and points somewhere useful', () => {
  // Absence is normal: the reporter can exclude any artifact before exporting. An
  // empty output here would read as a broken tool.
  assert.throws(() => artifact(pkg, 'nope.log'), /not in this package/)
  assert.throws(() => artifact(pkg, 'nope.log'), /bugpacker files/)
})

test('files lists everything in the archive, digested or not', () => {
  const text = files(pkg)
  assert.match(text, /console\.log/)
  assert.match(text, /nested\/network\.har/)
})

test('an entry the digest does not cover is named, not called undigested', () => {
  const text = files(pkg)
  // "(not digested)" described our bookkeeping and read as "cannot be read", which
  // is the opposite of true: get_file and extract both return these.
  assert.doesNotMatch(text, /not digested/)
  assert.match(text, /report\.json\s+\d+\s+package metadata/)
  // The fixture carries no manifest.json, so undigestedRole covers it directly below.
})

test('every row carries a byte count, digest or no digest', () => {
  for (const line of files(pkg).split('\n')) {
    assert.match(line, /\s\d+\s/, `no size on: ${line}`)
  }
})

test('an attachment is named as unscrubbed rather than left blank', () => {
  assert.equal(undigestedRole('Unscrubbed-Attachments/notes.pdf'), 'attachment, not scrubbed')
  assert.equal(undigestedRole('report.json'), 'package metadata')
  assert.equal(undigestedRole('stray.txt'), 'not described in report.json')
})

test('extract writes one artifact and returns where it went', () => {
  const out = mkdtempSync(join(tmpdir(), 'bp-extract-'))
  const written = extract(pkg, out, 'console.log')
  assert.equal(written, join(out, 'console.log'))
  assert.equal(readFileSync(written, 'utf8'), 'boom\n')
})

test('extract with no name writes all of them, keeping the tree', () => {
  const out = mkdtempSync(join(tmpdir(), 'bp-extract-all-'))
  extract(pkg, out)
  assert.ok(existsSync(join(out, 'console.log')))
  assert.ok(existsSync(join(out, 'report.json')))
  assert.ok(existsSync(join(out, 'nested', 'network.har')))
})

test('extract refuses a name that is not in the package', () => {
  const out = mkdtempSync(join(tmpdir(), 'bp-extract-miss-'))
  assert.throws(() => extract(pkg, out, 'nope.log'), /not in this package/)
})

test('extract cannot be talked into writing outside the output directory', () => {
  // openPackage already refuses entries containing "..", so reaching this guard means
  // constructing a package that bypassed it. Tested anyway: this is the function that
  // writes, and a second lock on the door that matters is cheap.
  const evil = join(FIXTURES, 'evil.zip')
  writeFileSync(evil, zipSync({
    [`${FOLDER}/report.json`]: strToU8(JSON.stringify(report)),
    [`${FOLDER}/ok.txt`]: strToU8('fine'),
  }))
  const opened = openPackage(evil)
  const out = mkdtempSync(join(tmpdir(), 'bp-evil-'))
  // Forge the escape past the reader's guard, straight into the writer.
  opened.names.push('../escaped.txt')
  assert.throws(() => extract(opened, out), /Refusing to write outside/)
})

/* -------------------------------------------------------- network --failed -- */

test('--failed keeps the failed block and drops the ad-blocked one', () => {
  const log = [
    'FAILED REQUESTS',
    '---',
    '[+00:01.000] GET https://api.example.test/pay -> 500',
    '',
    'BLOCKED BEFORE REACHING A SERVER',
    '---',
    '[+00:02.000] GET https://tracker.example.test/x -> blocked',
  ].join('\n')
  const out = failedOnly(log)
  assert.match(out, /FAILED REQUESTS/)
  assert.match(out, /api\.example\.test/)
  assert.doesNotMatch(out, /BLOCKED BEFORE/)
  assert.doesNotMatch(out, /tracker\.example\.test/)
})

test('a log with no blocked section is an error, not the whole file handed back', () => {
  // Silently returning everything is how a filter lies: the caller asked to see one half
  // and would be shown both with nothing said.
  assert.throws(
    () => failedOnly('FAILED REQUESTS\n---\nnothing here\n'),
    /has no "BLOCKED BEFORE REACHING A SERVER" section/,
  )
})

test('--failed does not re-derive anything, it cuts at one heading', () => {
  // The whole justification for this being allowed under "no second renderer" is that it
  // splits the extension's own rendering on the extension's own heading. If the text
  // before the heading were rebuilt rather than sliced, this would catch it.
  const body = 'FAILED REQUESTS\n---\n  odd   spacing  and  [brackets]  kept  verbatim\n\n'
  const out = failedOnly(`${body}BLOCKED BEFORE REACHING A SERVER\n---\nx\n`)
  assert.equal(out, `${body.trimEnd()}\n`)
})
