/**
 * Opening packages, and refusing things that are not packages.
 *
 * The rejection cases matter more than the happy path. This tool is pointed at
 * arbitrary files by people who mistyped a path, and every one of those should produce
 * a sentence rather than a stack trace.
 *
 * Fixtures are built here rather than committed: a real capture is somebody's actual
 * browsing session, and this repo is public.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { zipSync, strToU8 } from 'fflate'

import { openPackage } from '../dist/package.js'
import { KNOWN_SCHEMA_VERSION } from '../dist/report.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const FIXTURES = join(HERE, 'fixtures')
mkdirSync(FIXTURES, { recursive: true })

const FOLDER = 'bugpacker-shop.example.test-2026-09-08-1432'

function minimalReport(over = {}) {
  return {
    $schema: 'https://bugpacker.com/report.schema.json',
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
    files: [{ name: 'BUG-REPORT.md', mime: 'text/markdown', bytes: 3, sha256: 'x',
              role: 'report-markdown' }],
    archive: { fileCount: 2, totalUncompressedBytes: 3 },
    ...over,
  }
}

function writeFixture(name, entries) {
  const path = join(FIXTURES, name)
  writeFileSync(path, zipSync(entries))
  return path
}

function packageFixture(name, { report = minimalReport(), extra = {} } = {}) {
  return writeFixture(name, {
    [`${FOLDER}/report.json`]: strToU8(JSON.stringify(report)),
    [`${FOLDER}/BUG-REPORT.md`]: strToU8('hi\n'),
    ...extra,
  })
}

test('opens a package and exposes the report', () => {
  const pkg = openPackage(packageFixture('good.zip'))
  assert.equal(pkg.folder, FOLDER)
  assert.equal(pkg.report.reported.title, 'Discount ignored')
  assert.equal(pkg.readText('BUG-REPORT.md'), 'hi\n')
  assert.ok(pkg.names.includes('report.json'))
})

test('names are relative to the folder, not the archive', () => {
  const pkg = openPackage(packageFixture('relative.zip'))
  assert.ok(!pkg.names.some((n) => n.startsWith(FOLDER)))
  assert.equal(pkg.read('nope.txt'), undefined)
})

test('a missing file says which file', () => {
  assert.throws(() => openPackage(join(FIXTURES, 'does-not-exist.zip')), /No such file/)
})

test('something that is not a zip is refused', () => {
  const path = join(FIXTURES, 'not-a-zip.zip')
  writeFileSync(path, 'this is just text')
  assert.throws(() => openPackage(path), /not a readable ZIP/)
})

test('a zip without report.json is refused as not a package', () => {
  const path = writeFixture('no-report.zip', { [`${FOLDER}/notes.txt`]: strToU8('hello') })
  assert.throws(() => openPackage(path), /no report\.json/)
})

test('a zip with files at its root is refused', () => {
  const path = writeFixture('flat.zip', { 'report.json': strToU8('{}') })
  assert.throws(() => openPackage(path), /at its root/)
})

test('two top-level folders is not a package', () => {
  const path = writeFixture('two.zip', {
    [`${FOLDER}/report.json`]: strToU8(JSON.stringify(minimalReport())),
    'other/thing.txt': strToU8('x'),
  })
  assert.throws(() => openPackage(path), /more than one top-level folder/)
})

test('an entry that escapes its folder is refused', () => {
  // Nothing here writes to disk today, but a name becomes a path the moment anything
  // extracts one, and this is the cheapest place to stop it.
  const path = writeFixture('slip.zip', {
    [`${FOLDER}/report.json`]: strToU8(JSON.stringify(minimalReport())),
    [`${FOLDER}/../../etc/passwd`]: strToU8('root'),
  })
  assert.throws(() => openPackage(path), /escapes its folder/)
})

test('invalid JSON in report.json says so', () => {
  const path = writeFixture('badjson.zip', { [`${FOLDER}/report.json`]: strToU8('{ nope') })
  assert.throws(() => openPackage(path), /not valid JSON/)
})

test('a report with no schemaVersion is not a Bugpacker package', () => {
  const path = writeFixture('noschema.zip', {
    [`${FOLDER}/report.json`]: strToU8(JSON.stringify({ hello: 'world' })),
  })
  assert.throws(() => openPackage(path), /does not look like a Bugpacker package/)
})

test('a newer schema tells the user to update rather than guessing', () => {
  const path = packageFixture('newer.zip', {
    report: minimalReport({ schemaVersion: KNOWN_SCHEMA_VERSION + 1 }),
  })
  assert.throws(() => openPackage(path), /Update the CLI/)
})

test('an older schema is still readable', () => {
  // Forward compatibility only runs one way. An older package is missing fields, not
  // carrying unknown ones, and refusing it would strand anyone with an old capture.
  const path = packageFixture('older.zip', {
    report: minimalReport({ schemaVersion: KNOWN_SCHEMA_VERSION - 1 }),
  })
  assert.equal(openPackage(path).report.schemaVersion, KNOWN_SCHEMA_VERSION - 1)
})

test('an incomplete report names the missing section', () => {
  const report = minimalReport()
  delete report.steps
  const path = packageFixture('incomplete.zip', { report })
  assert.throws(() => openPackage(path), /missing "steps"/)
})
