/**
 * Opening a Bugpacker package.
 *
 * Everything else in this tool is a view over what this returns, so the awkward parts
 * live here: finding the single top-level folder every package is wrapped in, refusing
 * anything that is not a package, and never letting an entry name escape that folder.
 */

import { readFileSync } from 'node:fs'
import { unzipSync, strFromU8 } from 'fflate'
import { validateReport } from './report.js'
import type { Report } from './report.js'

export interface BugPackage {
  /** Where it was read from, for error messages that say which file. */
  path: string
  /** The single directory every package is wrapped in, without a trailing slash. */
  folder: string
  report: Report
  /** Entry names relative to `folder`, in archive order. */
  names: string[]
  /** Raw bytes by name relative to `folder`. */
  read(name: string): Uint8Array | undefined
  /** UTF-8 text by name relative to `folder`. */
  readText(name: string): string | undefined
}

export function openPackage(path: string): BugPackage {
  let raw: Buffer
  try {
    raw = readFileSync(path)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') throw new Error(`No such file: ${path}`)
    if (code === 'EISDIR') throw new Error(`${path} is a directory, not a package.`)
    throw error
  }

  let entries: Record<string, Uint8Array>
  try {
    entries = unzipSync(new Uint8Array(raw))
  } catch {
    throw new Error(`${path} is not a readable ZIP archive.`)
  }

  const files = new Map<string, Uint8Array>()
  const names: string[] = []
  let folder: string | null = null

  for (const [entry, bytes] of Object.entries(entries)) {
    // Directory entries carry no content and only exist to record the tree.
    if (entry.endsWith('/')) continue
    const slash = entry.indexOf('/')
    if (slash === -1) {
      throw new Error(
        `${path} has "${entry}" at its root. A Bugpacker package wraps everything in one folder.`,
      )
    }
    const top = entry.slice(0, slash)
    if (folder === null) folder = top
    else if (top !== folder) {
      throw new Error(`${path} contains more than one top-level folder, so it is not a package.`)
    }
    const name = entry.slice(slash + 1)
    // An archive that can be talked into writing outside its own folder is the oldest
    // trick there is. Nothing here writes to disk today, but a name is a path the
    // moment anybody extracts one, and refusing here costs nothing.
    if (name.split('/').some((segment) => segment === '..')) {
      throw new Error(`${path} contains an entry that escapes its folder: ${entry}`)
    }
    files.set(name, bytes)
    names.push(name)
  }

  if (folder === null) throw new Error(`${path} is empty.`)

  const reportBytes = files.get('report.json')
  if (!reportBytes) {
    throw new Error(
      `${path} has no report.json, so it is not a Bugpacker package. ` +
        'Packages are the ZIP the extension writes to your downloads folder.',
    )
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(strFromU8(reportBytes))
  } catch (error) {
    throw new Error(`report.json in ${path} is not valid JSON: ${(error as Error).message}`)
  }
  validateReport(parsed)

  return {
    path,
    folder,
    report: parsed,
    names,
    read: (name) => files.get(name),
    readText: (name) => {
      const bytes = files.get(name)
      return bytes === undefined ? undefined : strFromU8(bytes)
    },
  }
}
