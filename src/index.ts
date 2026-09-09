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
import { steps, artifact, files, extract } from './commands/artifacts.js'

const USAGE = `bugpacker <command> <package.zip>

  show              everything, summarised
  steps             repro steps, expected and actual
  console           console output, uncaught errors and CSP violations
  network           failed requests, kept apart from ad-blocked noise
  har               the full session as HAR, for a HAR viewer
  files             what is in the package
  json              report.json, for piping into something else
  extract [name]    write an artifact to disk, or all of them
                      --out <dir>   where to write, default the current directory

  --help            this
  --version         the installed version

Reads a local file and prints. Makes no network requests.
https://bugpacker.com`

function fail(message: string): never {
  process.stderr.write(`${message}\n`)
  process.exit(1)
}

function flag(args: string[], name: string): string | undefined {
  const at = args.indexOf(`--${name}`)
  return at === -1 ? undefined : args[at + 1]
}

function main(argv: string[]): void {
  const args = argv.slice(2)

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    process.stdout.write(`${USAGE}\n`)
    return
  }
  if (args[0] === '--version' || args[0] === '-v') {
    // Read from the installed package rather than hardcoded, so it cannot drift from
    // what npm actually put on disk.
    const url = new URL('../package.json', import.meta.url)
    const pkg = JSON.parse(readFileSync(url, 'utf8')) as { version: string }
    process.stdout.write(`${pkg.version}\n`)
    return
  }

  const command = args[0]
  const positional = args.slice(1).filter((a) => !a.startsWith('--'))
  const target = positional[0]
  if (!target) fail(`${command} needs a package.\n\n${USAGE}`)

  let pkg
  try {
    pkg = openPackage(target)
  } catch (error) {
    fail((error as Error).message)
  }

  const write = (text: string): void => {
    process.stdout.write(text.length ? `${text}\n` : '')
  }

  try {
    switch (command) {
      case 'show':
        return write(show(pkg))
      case 'steps':
        return write(steps(pkg))
      case 'console':
        return write(artifact(pkg, 'console.log'))
      case 'network':
        return write(artifact(pkg, 'network-errors.log'))
      case 'har':
        return write(artifact(pkg, 'network.har'))
      case 'files':
        return write(files(pkg))
      case 'json':
        return write(JSON.stringify(pkg.report, null, 2))
      case 'extract':
        return write(extract(pkg, flag(args, 'out') ?? '.', positional[1]))
      default:
        fail(`Unknown command: ${command}\n\n${USAGE}`)
    }
  } catch (error) {
    fail((error as Error).message)
  }
}

main(process.argv)
