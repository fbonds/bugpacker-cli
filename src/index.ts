#!/usr/bin/env node
/**
 * bugpacker-cli
 *
 * Reads a Bugpacker package from disk. It opens a local file and prints; it makes no
 * network request of any kind, which is the point of the tool rather than a detail of
 * it: the package it reads never left the machine, and neither does anything here.
 */

import { readFileSync } from 'node:fs'
import { openPackage } from './package.js'
import { show } from './commands/show.js'

const USAGE = `bugpacker <command> <package.zip>

  show      everything, summarised
  json      report.json, for piping into something else

  --help    this
  --version the installed version

Reads a Bugpacker package. Makes no network requests.
https://bugpacker.com`

function fail(message: string): never {
  process.stderr.write(`${message}\n`)
  process.exit(1)
}

function main(argv: string[]): void {
  const args = argv.slice(2)

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    process.stdout.write(`${USAGE}\n`)
    return
  }
  if (args[0] === '--version' || args[0] === '-v') {
    // Read from the package rather than hardcoded, so it cannot drift from what npm
    // actually installed.
    const url = new URL('../package.json', import.meta.url)
    const pkg = JSON.parse(readFileSync(url, 'utf8')) as { version: string }
    process.stdout.write(`${pkg.version}\n`)
    return
  }

  const [command, target] = args
  if (!target) fail(`${command} needs a package.\n\n${USAGE}`)

  let pkg
  try {
    pkg = openPackage(target)
  } catch (error) {
    fail((error as Error).message)
  }

  switch (command) {
    case 'show':
      process.stdout.write(`${show(pkg)}\n`)
      return
    case 'json':
      process.stdout.write(`${JSON.stringify(pkg.report, null, 2)}\n`)
      return
    default:
      fail(`Unknown command: ${command}\n\n${USAGE}`)
  }
}

main(process.argv)
