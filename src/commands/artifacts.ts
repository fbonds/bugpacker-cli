/**
 * The commands that reach into a package for one thing.
 *
 * `console` and `network` deliberately print the extension's own rendering rather than
 * building their own. Those files already draw the distinction that matters most in
 * them, between a request that reached a server and failed and one an ad blocker killed
 * before it left the browser, and a second renderer here would be one more thing to
 * keep in step with a format that is not ours.
 */

import { writeFileSync, mkdirSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import type { BugPackage } from '../package.js'

/**
 * The two headings `network-errors.log` is built from, written as literals by the
 * extension's renderer. `--failed` keeps the first block and drops the second.
 *
 * This is not the second renderer that file's header rules out. It splits an existing
 * rendering on a heading the rendering itself uses to draw the distinction that matters
 * most in it, between a request that reached a server and failed and one that never left
 * the browser. Nothing here re-derives a line from the HAR.
 *
 * The coupling is real and it is one string. If a future package does not carry that
 * heading, say so rather than returning the whole file as though it had been filtered:
 * silently handing back everything is how a filter lies.
 */
const BLOCKED_HEADING = 'BLOCKED BEFORE REACHING A SERVER'

export function failedOnly(text: string): string {
  const at = text.indexOf(BLOCKED_HEADING)
  if (at === -1) {
    throw new Error(
      `This package's network-errors.log has no "${BLOCKED_HEADING}" section, so --failed ` +
        'cannot tell the two apart. Run network without it to see the whole file.',
    )
  }
  return `${text.slice(0, at).trimEnd()}\n`
}

export function steps(pkg: BugPackage): string {
  const r = pkg.report
  const out: string[] = []
  for (const step of r.steps) {
    const lead = step.ordinal === null ? '    ' : `${String(step.ordinal).padStart(2)}. `
    out.push(`${lead}${step.text}`)
  }
  if (r.reported.expected) out.push(`\nExpected: ${r.reported.expected}`)
  if (r.reported.actual) out.push(`Actual:   ${r.reported.actual}`)
  return out.join('\n')
}

/**
 * Print one artifact, or explain its absence.
 *
 * Absence is normal rather than an error: the review page lets the reporter exclude
 * any artifact before the package is built, so a missing console.log usually means
 * somebody chose that. Saying "not in this package" and pointing at `files` beats an
 * empty output that reads like a broken tool.
 */
export function artifact(pkg: BugPackage, name: string): string {
  const text = pkg.readText(name)
  if (text === undefined) {
    throw new Error(
      `${name} is not in this package. The reporter can exclude any artifact before ` +
        `exporting. Run "bugpacker files ${pkg.path}" to see what is here.`,
    )
  }
  return text.replace(/\n$/, '')
}

/** Where the extension puts files the reporter added, which it does not scrub. */
const ATTACHMENTS_FOLDER = 'Unscrubbed-Attachments'

/**
 * The role column for an entry that `report.json` does not describe.
 *
 * It used to read "(not digested)", which is true and useless: it describes our
 * bookkeeping rather than the file, and a reader told that a file is "not digested"
 * reasonably concludes it cannot be read. Every one of these is readable. So say what
 * the file is instead, and say it in the same vocabulary as the roles beside it.
 *
 * Three cases reach here. `report.json` cannot state its own size and `manifest.json`
 * is the other half of the same bookkeeping, so neither is ever listed. Attachments
 * are added after the digest is built. Anything else means the digest and the archive
 * disagree, which is worth naming rather than papering over.
 */
export function undigestedRole(name: string): string {
  if (name === 'report.json' || name === 'manifest.json') return 'package metadata'
  if (name.startsWith(`${ATTACHMENTS_FOLDER}/`)) return 'attachment, not scrubbed'
  return 'not described in report.json'
}

export function files(pkg: BugPackage): string {
  const digested = new Map(pkg.report.files.map((f) => [f.name, f]))
  const out: string[] = []
  for (const name of pkg.names) {
    const meta = digested.get(name)
    // The archive knows the size of every entry, so there is no reason to print a
    // blank column for the ones the digest happens not to cover.
    const bytes = meta ? meta.bytes : (pkg.read(name)?.length ?? 0)
    const role = meta ? meta.role : undigestedRole(name)
    out.push(`${name.padEnd(34)} ${String(bytes).padStart(9)}  ${role}`)
  }
  return out.join('\n')
}

/**
 * Write one artifact, or all of them, to a directory.
 *
 * The HAR is the reason this exists: it is worth little in a terminal and a lot in
 * DevTools, which needs it as a file on disk.
 *
 * Every destination is resolved and checked to be inside the output directory. The
 * package reader already refuses entry names containing `..`, so this is the second
 * guard rather than the first, and it is here because this is the function that
 * actually writes.
 */
export function extract(pkg: BugPackage, outDir: string, name?: string): string {
  const root = resolve(outDir)
  const wanted = name ? [name] : pkg.names
  if (name && !pkg.names.includes(name)) {
    throw new Error(
      `${name} is not in this package. Run "bugpacker files ${pkg.path}" to see what is.`,
    )
  }

  const written: string[] = []
  for (const entry of wanted) {
    const target = resolve(join(root, entry))
    if (target !== root && !target.startsWith(root + '/')) {
      throw new Error(`Refusing to write outside ${root}: ${entry}`)
    }
    const bytes = pkg.read(entry)
    if (!bytes) continue
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, bytes)
    written.push(target)
  }
  return written.join('\n')
}
