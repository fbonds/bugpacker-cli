/**
 * The command line.
 *
 * Every case here is one that used to be wrong. The two forms in the README are the
 * first two, and the fourth is the one worth keeping a test for forever: it did not
 * fail, it wrote fifteen files into the current directory and said nothing.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { parseArgs } from '../dist/args.js'

const PKG = 'bugpacker-shop.example.test-2026-09-08-1432.zip'

test('a flag value is not mistaken for an artifact name', () => {
  const { command, positional, flags } = parseArgs(['extract', PKG, '--out', './bug'])
  assert.equal(command, 'extract')
  assert.deepEqual(positional, [PKG])
  assert.equal(flags.get('out'), './bug')
})

test('an artifact name survives alongside a flag', () => {
  const { positional, flags } = parseArgs(['extract', PKG, 'network.har', '--out', '.'])
  assert.deepEqual(positional, [PKG, 'network.har'])
  assert.equal(flags.get('out'), '.')
})

test('a flag before the package does not become the package', () => {
  const { positional, flags } = parseArgs(['extract', '--out', './bug', PKG])
  assert.deepEqual(positional, [PKG])
  assert.equal(flags.get('out'), './bug')
})

test('--out=value is read, not silently dropped', () => {
  const { positional, flags } = parseArgs(['extract', PKG, '--out=./bug'])
  assert.deepEqual(positional, [PKG])
  assert.equal(flags.get('out'), './bug')
})

test('a flag with nothing after it is refused', () => {
  assert.throws(() => parseArgs(['extract', PKG, '--out']), /--out needs a value/)
  assert.throws(() => parseArgs(['extract', PKG, '--out=']), /--out needs a value/)
})

test('a misspelled flag is refused rather than left in the positionals', () => {
  assert.throws(() => parseArgs(['extract', PKG, '--ou', './bug']), /Unknown option: --ou/)
})

test('a command with no flags is untouched', () => {
  const { command, positional, flags } = parseArgs(['show', PKG])
  assert.equal(command, 'show')
  assert.deepEqual(positional, [PKG])
  assert.equal(flags.size, 0)
})

/* ------------------------------------------------- flags belong to commands -- */

/**
 * The defect these protect against is silent acceptance, which is what this file was
 * written to prevent in the first place and what came back one level up when --json was
 * added for validate. `show pkg.zip --json` parsed cleanly, did nothing, and said nothing:
 * the caller asked for machine output and got prose with no indication why.
 *
 * So the assertion that matters is that an error is raised. A test that only checked the
 * accepted cases still pass would have gone green against the build that had the bug.
 */

test('a flag belonging to another command is refused, not ignored', () => {
  assert.throws(() => parseArgs(['show', 'pkg.zip', '--json']), /show does not take --json/)
  assert.throws(() => parseArgs(['network', 'pkg.zip', '--out', './x']), /network does not take --out/)
  assert.throws(() => parseArgs(['console', 'pkg.zip', '--failed']), /console does not take --failed/)
})

test('the refusal names the command that does take it', () => {
  // A dead end tells you that you are wrong. This tells you what to type instead.
  assert.throws(() => parseArgs(['show', 'pkg.zip', '--json']), /validate does\./)
  assert.throws(() => parseArgs(['steps', 'pkg.zip', '--failed']), /network does\./)
})

test('a flag no command takes is a typo and says so', () => {
  assert.throws(() => parseArgs(['show', 'pkg.zip', '--nope']), /Unknown option: --nope/)
  assert.throws(() => parseArgs(['validate', 'pkg.zip', '--errors-only']), /Unknown option: --errors-only/)
})

test('a command with no flags at all accepts none', () => {
  for (const command of ['show', 'steps', 'har', 'files', 'json', 'diff', 'mcp']) {
    assert.throws(() => parseArgs([command, 'pkg.zip', '--json']), /does not take|Unknown option/)
  }
})

test('every flag a command does accept still works', () => {
  assert.equal(parseArgs(['extract', 'pkg.zip', '--out', './bug']).flags.get('out'), './bug')
  assert.equal(parseArgs(['extract', 'pkg.zip', '--out=./bug']).flags.get('out'), './bug')
  assert.equal(parseArgs(['validate', 'pkg.zip', '--json']).switches.has('json'), true)
  assert.equal(parseArgs(['network', 'pkg.zip', '--failed']).switches.has('failed'), true)
})

test('a switch given a value is still refused on the command that accepts it', () => {
  assert.throws(() => parseArgs(['validate', 'pkg.zip', '--json=true']), /--json takes no value/)
  assert.throws(() => parseArgs(['network', 'pkg.zip', '--failed=1']), /--failed takes no value/)
})

test('positionals survive a flag that belongs to the command', () => {
  const args = parseArgs(['extract', 'pkg.zip', 'network.har', '--out', './bug'])
  assert.deepEqual(args.positional, ['pkg.zip', 'network.har'])
})
