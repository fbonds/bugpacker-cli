/**
 * Make every `bin` entry executable after a build.
 *
 * `tsc` does not set the execute bit. It preserves the mode of a file it overwrites and
 * creates a new one at 0644, so an incrementally built `dist/` can carry the bit for
 * reasons that have nothing to do with the build: `npm link` chmods its target, and tsc
 * then keeps that mode on every subsequent compile. That is how 0.1.0 shipped 0755 while
 * nothing in the repository was responsible for it, and how 0.1.1 shipped 0644 the first
 * time a clean `rm -rf dist` preceded the pack.
 *
 * npm stores file modes in the tarball and restores them on install. It does not add the
 * bit for you. A bin at 0644 installs, gets its symlink, and dies as
 * `sh: .../bin/bugpacker: Permission denied` on the first run. A linked working copy hides
 * it completely, because the link resolves to a dist that npm link already chmodded.
 *
 * The target is read from `bin` in package.json rather than hardcoded, so a second entry
 * is covered without anyone remembering this file exists. chmod comes from node rather
 * than the shell so the build does not depend on a POSIX `chmod` being on PATH.
 */

import { chmodSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = new URL('../', import.meta.url)
const pkg = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'))

const bins = typeof pkg.bin === 'string' ? { [pkg.name]: pkg.bin } : (pkg.bin ?? {})
const entries = Object.values(bins)

if (entries.length === 0) {
  console.error('No "bin" entry in package.json, so nothing to make executable.')
  process.exit(1)
}

for (const relative of entries) {
  const path = fileURLToPath(new URL(relative, root))
  chmodSync(path, 0o755)
  const mode = statSync(path).mode & 0o777
  if ((mode & 0o111) === 0) {
    console.error(`Failed to make ${relative} executable; it is ${mode.toString(8)}.`)
    process.exit(1)
  }
}
