/**
 * The bin has to be executable in the tarball, not in the working tree.
 *
 * 0.1.1 shipped `dist/index.js` at 0644 where 0.1.0 shipped 0755. The cause is that `tsc`
 * preserves the mode of a file it overwrites and creates a new one at 0644, while
 * `npm link` chmods its target to 0755. An incrementally built `dist/` therefore carried
 * the bit for a reason the build had nothing to do with, and the first release packed
 * after a clean `rm -rf dist` lost it.
 *
 * What that costs is version-dependent and this test does not claim otherwise. npm 11.19.0
 * chmods a non-executable bin to 0755 on install, so a 0644 bin may never bite a user of
 * that npm. The mode in the artifact is wrong regardless, and that is the whole assertion.
 *
 * Why it reads the tarball. Every pre-publish check ran a linked working copy, where the
 * bin is executable because `npm link` made it so. An assertion against
 * `dist/index.js` in the repository would have passed throughout. The tarball is the one
 * thing a link cannot mask.
 *
 * It costs a real `npm pack`, which runs `prepack` and therefore a full build. That is the
 * price of testing the artifact instead of the source, and it is the only test here that
 * pays it.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, statSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

/** Pack the package as npm would, extract it, and hand back the extracted root. */
function packAndExtract() {
  const out = mkdtempSync(join(tmpdir(), 'bp-pack-'))
  execFileSync('npm', ['pack', '--pack-destination', out], { cwd: ROOT, stdio: 'pipe' })
  const tgz = readdirSync(out).find((f) => f.endsWith('.tgz'))
  assert.ok(tgz, 'npm pack produced no tarball')
  execFileSync('tar', ['-xzf', join(out, tgz), '-C', out])
  return { extracted: join(out, 'package'), tarball: join(out, tgz) }
}

const { extracted, tarball } = packAndExtract()
const version = JSON.parse(readFileSync(join(extracted, 'package.json'), 'utf8')).version

test('every bin entry in the tarball is executable', () => {
  const pkg = JSON.parse(readFileSync(join(extracted, 'package.json'), 'utf8'))
  const bins = typeof pkg.bin === 'string' ? { [pkg.name]: pkg.bin } : pkg.bin
  const names = Object.values(bins)
  assert.ok(names.length > 0, 'package.json declares no bin')
  for (const relative of names) {
    const mode = statSync(join(extracted, relative)).mode & 0o777
    assert.notEqual(
      mode & 0o111,
      0,
      `${relative} records mode ${mode.toString(8)} in the tarball, which is not ` +
        'executable.',
    )
  }
})

test('the bin in the tarball has a shebang, since the mode alone is not enough', () => {
  const pkg = JSON.parse(readFileSync(join(extracted, 'package.json'), 'utf8'))
  const relative = Object.values(pkg.bin)[0]
  const first = readFileSync(join(extracted, relative), 'utf8').split('\n')[0]
  assert.match(first, /^#!/)
})

test('the installed bin runs, invoked through the symlink npm creates', () => {
  // This is the path that failed. npm installs the tarball, restores the mode it recorded,
  // and links node_modules/.bin/bugpacker at it. A shell then execs the link, reaches a
  // 0644 target and reports Permission denied. Running the file through `node` instead
  // would succeed whatever the mode is and would prove nothing.
  //
  // The extracted tarball cannot be run in place, because it has no node_modules and
  // `fflate` does not resolve. That is why this installs rather than exec'ing the
  // extracted file directly.
  const project = mkdtempSync(join(tmpdir(), 'bp-install-'))
  execFileSync('npm', ['init', '-y'], { cwd: project, stdio: 'pipe' })
  execFileSync('npm', ['install', '--no-audit', '--no-fund', tarball], { cwd: project, stdio: 'pipe' })

  const link = join(project, 'node_modules', '.bin', 'bugpacker')
  const res = spawnSync(link, ['--version'], { encoding: 'utf8' })
  assert.equal(res.error, undefined, `could not exec the installed bin: ${res.error?.message}`)
  assert.equal(res.status, 0, res.stderr)
  assert.equal(res.stdout.trim(), version)
})
