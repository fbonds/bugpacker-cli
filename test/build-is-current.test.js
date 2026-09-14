/**
 * Refuse to run the suite against a stale build.
 *
 * Every other test file imports from `../dist/`. When `tsc` fails, `noEmitOnError` leaves
 * the previous `dist/` exactly where it was, so those imports still resolve and the suite
 * exercises the last build that compiled rather than the code under test. The result reads
 * as a pass.
 *
 * That has happened twice. Once when a guard was stripped from a build artifact and the
 * tool under test rebuilt it before the assertion ran. Once when a deliberate break was
 * added to `src/mcp.ts`, the build failed on a type error, and the run against `dist/`
 * returned a normal result, which would have been reported as the break not firing.
 *
 * This lives in the suite rather than in the `npm test` script on purpose. `npm test` runs
 * `npm run build && node --test`, so a failed build already stops it there. The gap is
 * every other way `dist/` gets exercised: `node --test test/*.test.js` on its own, a single
 * test file, or a one-off `node dist/index.js` during verification. A check in the script
 * would not cover any of those. A test file covers every invocation of the suite, and
 * cannot itself go stale because it reads mtimes rather than a recorded value.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, statSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SRC = join(ROOT, 'src')
const DIST = join(ROOT, 'dist')

/** Every file under `dir` matching `ext`, recursively, as absolute paths. */
function walk(dir, ext) {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(path, ext))
    else if (entry.name.endsWith(ext)) out.push(path)
  }
  return out
}

/** `src/commands/show.ts` -> `dist/commands/show.js` */
const compiled = (sourcePath) =>
  join(DIST, relative(SRC, sourcePath).replace(/\.ts$/, '.js'))

test('every source file has been compiled', () => {
  const missing = walk(SRC, '.ts')
    .filter((s) => !existsSync(compiled(s)))
    .map((s) => relative(ROOT, s))
  assert.deepEqual(missing, [], `no compiled output for: ${missing.join(', ')}. Run npm run build.`)
})

test('no source file is newer than what was compiled from it', () => {
  const stale = []
  for (const source of walk(SRC, '.ts')) {
    const built = compiled(source)
    if (!existsSync(built)) continue // the test above owns that case
    const sourceTime = statSync(source).mtimeMs
    const builtTime = statSync(built).mtimeMs
    if (sourceTime > builtTime) {
      stale.push(
        `${relative(ROOT, source)} is ${Math.round((sourceTime - builtTime) / 1000)}s ` +
          `newer than ${relative(ROOT, built)}`,
      )
    }
  }
  assert.deepEqual(
    stale,
    [],
    'The build is stale, so the suite would be testing the previous one.\n' +
      'This is what a failed tsc looks like from here, because noEmitOnError leaves\n' +
      'the old dist/ in place. Run npm run build and read its output.\n' +
      stale.join('\n'),
  )
})
