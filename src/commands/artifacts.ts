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

export function files(pkg: BugPackage): string {
  const digested = new Map(pkg.report.files.map((f) => [f.name, f]))
  const out: string[] = []
  for (const name of pkg.names) {
    const meta = digested.get(name)
    const bytes = meta ? String(meta.bytes).padStart(9) : ''.padStart(9)
    const role = meta ? meta.role : '(not digested)'
    out.push(`${name.padEnd(34)} ${bytes}  ${role}`)
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
