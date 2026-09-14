/**
 * Integrity checking, exercised against packages that have actually been tampered with.
 *
 * Every fixture here starts as a valid package and is then damaged one specific way, so
 * each test can assert not only that the right check failed but that the others did not.
 * A test that only asserts "something failed" would pass against a validator that failed
 * everything, which is the shape of check this project keeps having to throw away.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { writeFileSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { zipSync, strToU8 } from 'fflate'

import { openPackage } from '../dist/package.js'
import { validate, passed } from '../dist/commands/validate.js'
import { KNOWN_SCHEMA_VERSION } from '../dist/report.js'

const FOLDER = 'bugpacker-shop.example.test-2026-09-08-1432'
const dir = mkdtempSync(join(tmpdir(), 'bp-validate-'))

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

/** A package whose report.json describes its own contents correctly. */
function buildValid(name, mutate = (entries, report) => ({ entries, report })) {
  const artifacts = {
    'console.log': strToU8('[+00:01.000] ERROR boom\n'),
    'actions.log': strToU8('1. Clicked Pay\n'),
  }
  const files = Object.entries(artifacts).map(([n, bytes]) => ({
    name: n,
    mime: 'text/plain',
    bytes: bytes.length,
    sha256: sha256(bytes),
    role: n === 'console.log' ? 'log-console' : 'log-actions',
    derived: true,
  }))
  let report = {
    schemaVersion: KNOWN_SCHEMA_VERSION,
    reportId: 'r1',
    tool: { name: 'Bugpacker', version: '2.0.2' },
    fingerprint: 'f1',
    createdAt: '2026-09-08T14:32:00.000Z',
    page: { url: 'https://shop.example.test/pay', startUrl: 'https://shop.example.test/pay',
            host: 'shop.example.test', path: '/pay', title: 'Pay' },
    recording: { startedAt: '2026-09-08T14:31:00.000Z', durationMs: 60000, navigations: 0,
                 reloadedAtStart: true },
    reported: { title: 'Boom', severity: 'major', expected: 'no boom', actual: 'boom', notes: '' },
    steps: [],
    files,
    // fileCount counts every entry including report.json; totalUncompressedBytes is the
    // sum of files[].bytes and so excludes it. Both verified against real packages.
    archive: { fileCount: Object.keys(artifacts).length + 1,
               totalUncompressedBytes: files.reduce((n, f) => n + f.bytes, 0) },
    redaction: { total: 3, distinct: 2,
                 byCategory: [{ category: 'email', values: 1, occurrences: 2 },
                              { category: 'phone', values: 1, occurrences: 1 }] },
    counts: { errors: 1, consoleErrors: 1, uncaughtErrors: 0 },
  }
  let entries = { ...artifacts }
  ;({ entries, report } = mutate(entries, report))
  const zip = { [`${FOLDER}/report.json`]: strToU8(JSON.stringify(report)) }
  for (const [n, bytes] of Object.entries(entries)) zip[`${FOLDER}/${n}`] = bytes
  const path = join(dir, name)
  writeFileSync(path, zipSync(zip))
  return path
}

const check = (checks, name) => checks.find((c) => c.name === name)
const failed = (checks) => checks.filter((c) => !c.ok).map((c) => c.name).sort()

test('an untouched package passes every check', () => {
  const checks = validate(openPackage(buildValid('clean.zip')))
  assert.deepEqual(failed(checks), [])
  assert.equal(passed(checks), true)
})

test('one changed byte fails the digest and nothing else', () => {
  // The byte is replaced rather than added, so the length is unchanged and byte-lengths
  // has no reason to fire. That separation is the point of the test.
  const path = buildValid('flipped.zip', (entries, report) => {
    const b = Uint8Array.from(entries['console.log'])
    b[3] = b[3] ^ 0x20
    return { entries: { ...entries, 'console.log': b }, report }
  })
  const checks = validate(openPackage(path))
  assert.deepEqual(failed(checks), ['digests'])
  assert.equal(passed(checks), false)
  assert.match(check(checks, 'digests').detail, /console\.log: report\.json says [0-9a-f]{64}, archive holds [0-9a-f]{64}/)
})

test('a truncated file fails the digest and the length, and not the archive total', () => {
  // archive-total-bytes compares report.json against report.json, so truncation leaves it
  // passing: files[].bytes does not change when the bytes do. That is why it is a warning.
  const path = buildValid('truncated.zip', (entries, report) => ({
    entries: { ...entries, 'console.log': entries['console.log'].slice(0, 5) },
    report,
  }))
  const checks = validate(openPackage(path))
  assert.deepEqual(failed(checks), ['byte-lengths', 'digests'])
  assert.equal(check(checks, 'archive-total-bytes').ok, true)
  assert.equal(passed(checks), false)
})

test('a removed file fails presence and the file count, not the digests', () => {
  const path = buildValid('deleted.zip', (entries, report) => {
    const { 'console.log': _gone, ...rest } = entries
    return { entries: rest, report }
  })
  const checks = validate(openPackage(path))
  assert.deepEqual(failed(checks), ['archive-file-count', 'listed-files-present'])
  assert.equal(check(checks, 'digests').ok, true, 'a file that is gone has nothing to hash')
})

test('a file added without updating report.json is a failure', () => {
  const path = buildValid('inserted.zip', (entries, report) => ({
    entries: { ...entries, 'notes.txt': strToU8('added after export\n') },
    report,
  }))
  const checks = validate(openPackage(path))
  assert.deepEqual(failed(checks), ['archive-file-count', 'unlisted-entries'])
  assert.equal(passed(checks), false, 'the count is a failure even though the entry is a warning')
})

test('a file added by a newer extension warns and still exits clean', () => {
  // Same insertion, except archive.fileCount agrees with it. This is what an extension
  // writing an artifact this version has never heard of looks like, and it must not be
  // reported as tampering.
  const path = buildValid('newer.zip', (entries, report) => ({
    entries: { ...entries, 'notes.txt': strToU8('a new artifact\n') },
    report: { ...report, archive: { ...report.archive, fileCount: report.archive.fileCount + 1 } },
  }))
  const checks = validate(openPackage(path))
  assert.deepEqual(failed(checks), ['unlisted-entries'])
  assert.equal(passed(checks), true, 'warnings must not change the exit code')
  assert.match(check(checks, 'unlisted-entries').detail, /no recorded digest/)
})

test('the unlisted warning gives both readings, because it cannot tell them apart', () => {
  const path = buildValid('ambiguous.zip', (entries, report) => ({
    entries: { ...entries, 'notes.txt': strToU8('x\n') },
    report: { ...report, archive: { ...report.archive, fileCount: report.archive.fileCount + 1 } },
  }))
  const detail = check(validate(openPackage(path)), 'unlisted-entries').detail
  assert.match(detail, /newer extension/)
  assert.match(detail, /added after export/)
})

test('a report that miscounts its own redactions warns rather than failing', () => {
  const path = buildValid('redaction.zip', (entries, report) => ({
    entries,
    report: { ...report, redaction: { ...report.redaction, total: 99 } },
  }))
  const checks = validate(openPackage(path))
  assert.deepEqual(failed(checks), ['redaction-totals'])
  assert.equal(passed(checks), true)
  assert.match(check(checks, 'redaction-totals').detail, /says 99, byCategory sums to 3/)
})

test('errors below the recorded components warns; above them does not', () => {
  const low = buildValid('low.zip', (entries, report) => ({
    entries, report: { ...report, counts: { errors: 0, consoleErrors: 2, uncaughtErrors: 1 } },
  }))
  assert.deepEqual(failed(validate(openPackage(low))), ['error-counts'])

  // A total larger than consoleErrors plus uncaughtErrors is explainable: CSP violations
  // are part of it and no key records them separately. Not a warning.
  const high = buildValid('high.zip', (entries, report) => ({
    entries, report: { ...report, counts: { errors: 5, consoleErrors: 1, uncaughtErrors: 0 } },
  }))
  assert.deepEqual(failed(validate(openPackage(high))), [])
})

test('a report with no archive, redaction or counts block says so instead of failing', () => {
  const path = buildValid('sparse.zip', (entries, report) => {
    const { archive: _a, redaction: _r, counts: _c, ...rest } = report
    return { entries, report: rest }
  })
  const checks = validate(openPackage(path))
  assert.deepEqual(failed(checks), [])
  for (const name of ['archive-file-count', 'archive-total-bytes', 'redaction-totals', 'error-counts']) {
    assert.match(check(checks, name).detail, /nothing to compare/)
  }
})

test('every check declares a level, because the exit code depends on it', () => {
  const checks = validate(openPackage(buildValid('levels.zip')))
  assert.equal(checks.length, 8)
  for (const c of checks) {
    assert.ok(c.level === 'failure' || c.level === 'warning', `${c.name} has level ${c.level}`)
    assert.ok(c.detail.length > 0, `${c.name} has no detail`)
  }
})

test('a consistent forgery passes, which is the limit of what this can do', () => {
  // Not a bug. report.json is unsigned and describes itself, so an artifact altered
  // together with the SHA-256 recorded for it is indistinguishable from the original.
  // This is here so the limit is a fact the suite states rather than something a later
  // reader discovers and files. If a check is ever added that catches this, it will fail
  // here first and that is the right place to argue about it.
  const path = buildValid('forged.zip', (entries, report) => {
    const b = Uint8Array.from(entries['console.log'])
    b[3] = b[3] ^ 0x20
    const files = report.files.map((f) =>
      f.name === 'console.log' ? { ...f, sha256: sha256(b), bytes: b.length } : f,
    )
    return { entries: { ...entries, 'console.log': b }, report: { ...report, files } }
  })
  const checks = validate(openPackage(path))
  assert.deepEqual(failed(checks), [])
  assert.equal(passed(checks), true)
})
