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
