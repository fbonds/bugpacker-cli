/**
 * Integrity and internal consistency for a package.
 *
 * Deliberately not JSON Schema validation. The schema travels inside every package and
 * could be applied literally, but doing so needs a schema validator, which is a second
 * runtime dependency this tool does not have. What is left when you drop that framing is
 * the more useful half anyway: a package is a file somebody sent you, and the question
 * worth answering is whether it is the file the extension wrote.
 *
 * Two levels. A failure means the package is damaged or altered and nothing downstream
 * should trust it. A warning means something is worth reading but is not evidence the file
 * was touched: a report miscounting itself, which is a defect in whatever wrote it, or an
 * entry this version does not recognise, which is what a newer extension looks like.
 * Warnings deliberately do not change the exit code. A check that makes CI red for an
 * extension bug is a check CI learns to ignore, and then the digest failures go unread too.
 */

import { createHash } from 'node:crypto'
import type { BugPackage } from '../package.js'

/** Entries every package carries that `files[]` does not list. */
const UNLISTED_BY_DESIGN = new Set(['report.json', 'manifest.json'])

export type Level = 'failure' | 'warning'

export interface Check {
  /** Stable identifier, safe for a CI job to match on. */
  name: string
  level: Level
  ok: boolean
  /** One line when it passed; what was expected and what was found when it did not. */
  detail: string
}

const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')

export function validate(pkg: BugPackage): Check[] {
  const checks: Check[] = []
  const report = pkg.report
  const listed = report.files ?? []
  const present = new Set(pkg.names)

  // ---------------------------------------------------------------- failures --

  const missing = listed.filter((f) => !present.has(f.name)).map((f) => f.name)
  checks.push({
    name: 'listed-files-present',
    level: 'failure',
    ok: missing.length === 0,
    detail: missing.length
      ? `report.json lists ${missing.length} file(s) the archive does not contain: ${missing.join(', ')}`
      : `all ${listed.length} files listed in report.json are in the archive`,
  })

  /**
   * Hashing reads nothing new. openPackage already decompresses every entry eagerly, so
   * the bytes are in memory before this runs and the cost here is CPU, not a second pass
   * over the file. Streaming this would optimise the wrong layer: the eager read upstream
   * is what would have to change first, and it is load-bearing for every other command.
   */
  const badDigest: string[] = []
  let digested = 0
  for (const entry of listed) {
    const bytes = pkg.read(entry.name)
    if (bytes === undefined) continue // already reported by listed-files-present
    digested++
    const actual = sha256(bytes)
    if (actual !== entry.sha256) {
      badDigest.push(`${entry.name}: report.json says ${entry.sha256}, archive holds ${actual}`)
    }
  }
  checks.push({
    name: 'digests',
    level: 'failure',
    ok: badDigest.length === 0,
    detail: badDigest.length
      ? `${badDigest.length} of ${digested} file(s) do not match their recorded SHA-256:\n    ${badDigest.join('\n    ')}`
      : `${digested} file(s) match their recorded SHA-256`,
  })

  const badSize: string[] = []
  for (const entry of listed) {
    const bytes = pkg.read(entry.name)
    if (bytes === undefined) continue
    if (bytes.length !== entry.bytes) {
      badSize.push(`${entry.name}: report.json says ${entry.bytes}, archive holds ${bytes.length}`)
    }
  }
  checks.push({
    name: 'byte-lengths',
    level: 'failure',
    ok: badSize.length === 0,
    detail: badSize.length
      ? `${badSize.length} file(s) are not the recorded length:\n    ${badSize.join('\n    ')}`
      : `${digested} file(s) are the recorded length`,
  })

  const archive = report.archive
  checks.push({
    name: 'archive-file-count',
    level: 'failure',
    ok: archive === undefined || archive.fileCount === pkg.names.length,
    detail:
      archive === undefined
        ? 'report.json records no archive block, so there is nothing to compare'
        : archive.fileCount === pkg.names.length
          ? `archive.fileCount is ${archive.fileCount} and the archive holds ${pkg.names.length}`
          : `archive.fileCount says ${archive.fileCount}, the archive holds ${pkg.names.length}`,
  })

  // ---------------------------------------------------------------- warnings --

  // Not the archive's total. It is the sum of files[].bytes, which excludes report.json
  // and manifest.json, and comparing it against the uncompressed size of every entry
  // fails on every package ever written.
  //
  // A warning rather than a failure, and the distinction was found by a test rather than
  // by design. Both sides of this comparison come out of report.json, so it can only ever
  // catch a report that miscounts itself. Truncating a file inside the archive leaves it
  // passing, because files[].bytes does not change when the bytes do. That makes it
  // arithmetic, like the two below, and the damage it looks like it covers is covered by
  // byte-lengths, which compares against what the archive actually holds.
  const sumListed = listed.reduce((n, f) => n + f.bytes, 0)
  checks.push({
    name: 'archive-total-bytes',
    level: 'warning',
    ok: archive === undefined || archive.totalUncompressedBytes === sumListed,
    detail:
      archive === undefined
        ? 'report.json records no archive block, so there is nothing to compare'
        : archive.totalUncompressedBytes === sumListed
          ? `archive.totalUncompressedBytes is ${archive.totalUncompressedBytes} and files[] sums to the same`
          : `archive.totalUncompressedBytes says ${archive.totalUncompressedBytes}, files[] sums to ${sumListed}`,
  })

  const listedNames = new Set(listed.map((f) => f.name))
  const unlisted = pkg.names.filter((n) => !listedNames.has(n) && !UNLISTED_BY_DESIGN.has(n))
  checks.push({
    name: 'unlisted-entries',
    level: 'warning',
    ok: unlisted.length === 0,
    detail: unlisted.length
      ? `${unlisted.length} entry(ies) are in the archive but not in report.json: ${unlisted.join(', ')}\n` +
        '    This reads two ways and only you can tell them apart. A newer extension\n' +
        '    writing an artifact this version has not heard of looks exactly like this, and\n' +
        '    so does a file somebody added after export. It is a warning rather than a\n' +
        '    failure because the first is ordinary. Note that this is the only check that\n' +
        '    can see an addition at all: a file absent from files[] has no recorded digest,\n' +
        '    so there is nothing for the digest check to fail on.'
      : 'every entry in the archive is either listed in report.json or report.json/manifest.json',
  })

  const redaction = report.redaction
  const byCategory = redaction?.byCategory ?? []
  const sumOccurrences = byCategory.reduce((n, c) => n + c.occurrences, 0)
  checks.push({
    name: 'redaction-totals',
    level: 'warning',
    ok: redaction === undefined || redaction.total === sumOccurrences,
    detail:
      redaction === undefined
        ? 'report.json records no redaction block, so there is nothing to compare'
        : redaction.total === sumOccurrences
          ? `redaction.total is ${redaction.total} and byCategory sums to the same`
          : `redaction.total says ${redaction.total}, byCategory sums to ${sumOccurrences}`,
  })

  /**
   * The schema says errors is consoleErrors plus uncaughtErrors plus CSP violations, and
   * no key records CSP violations separately. So a total larger than the two that are
   * recorded is explainable and a total smaller than them is not. Checked in the one
   * direction that can mean something rather than asserting an equality the format
   * cannot support.
   */
  const counts = (report.counts ?? {}) as Record<string, number>
  const recorded = (counts.consoleErrors ?? 0) + (counts.uncaughtErrors ?? 0)
  const errors = counts.errors ?? 0
  checks.push({
    name: 'error-counts',
    level: 'warning',
    ok: counts.errors === undefined || errors >= recorded,
    detail:
      counts.errors === undefined
        ? 'report.json records no error counts, so there is nothing to compare'
        : errors >= recorded
          ? `counts.errors is ${errors}, at least consoleErrors plus uncaughtErrors (${recorded})`
          : `counts.errors says ${errors}, fewer than consoleErrors plus uncaughtErrors (${recorded})`,
  })

  return checks
}

/** True when nothing failed. Warnings do not count, which is the whole point of them. */
export const passed = (checks: Check[]): boolean =>
  checks.every((c) => c.ok || c.level === 'warning')

export function renderChecks(pkg: BugPackage, checks: Check[]): string {
  const out: string[] = []
  const version = pkg.report.schemaVersion
  out.push(`${pkg.path}`)
  out.push(`report schema v${version}, ${pkg.names.length} entries`)
  out.push('')
  for (const check of checks) {
    const mark = check.ok ? 'ok  ' : check.level === 'failure' ? 'FAIL' : 'warn'
    out.push(`  ${mark}  ${check.name.padEnd(21)} ${check.detail}`)
  }
  out.push('')
  const failures = checks.filter((c) => !c.ok && c.level === 'failure').length
  const warnings = checks.filter((c) => !c.ok && c.level === 'warning').length
  if (failures) {
    out.push(`${failures} check(s) failed. This package is not what report.json describes.`)
  } else if (warnings) {
    // Deliberately says nothing about the cause. Two different warnings live here and
    // they mean different things: a report miscounting itself, and an entry this version
    // does not recognise. Naming one of them in the summary is wrong half the time.
    out.push(`No failures, so nothing here is damaged. ${warnings} warning(s) worth reading above.`)
  } else {
    out.push('Every check passed.')
  }
  return out.join('\n')
}

export function checksAsJson(pkg: BugPackage, checks: Check[]): string {
  return JSON.stringify(
    {
      package: pkg.path,
      schemaVersion: pkg.report.schemaVersion,
      entries: pkg.names.length,
      ok: passed(checks),
      checks,
    },
    null,
    2,
  )
}
