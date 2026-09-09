# bugpacker-cli

Read a [Bugpacker](https://bugpacker.com) bug package from disk, on the command line or
over MCP.

Bugpacker is a Chrome extension that records a bug while you reproduce it and saves a
single ZIP: screenshots, console output, failed requests, a HAR, the DOM, the state of
every form field, and the steps you took. Nothing it captures leaves your machine.

This is the tool that reads one back.

> **Status:** early. The package format is stable and published, but this is not
> released yet. Expect the surface to move.

## Why it exists

Every other tool in this category can hand a coding agent your bug report because it is
already on their servers. Bugpacker's is a file, so it needs a different route: a local
server that reads the file you already have.

Same feature, opposite data path. The agent gets the console error, the failing request
and the repro steps; nobody else gets anything.

## Install

npm install -g bugpacker-cli

## Use it from a terminal

bugpacker show <package.zip>       # everything, summarised
bugpacker steps <package.zip>      # repro steps, expected, actual
bugpacker console <package.zip>    # console output and uncaught errors
bugpacker network <package.zip>    # failed and non-2xx requests
bugpacker json <package.zip>       # report.json, for piping into something else

## Use it from a coding agent

bugpacker mcp <package.zip>

Starts an MCP server over stdio exposing the package as tools an agent can call. Point
Claude Code, Cursor or any other MCP client at it and ask it to fix the bug.

## The format

Every package contains `report.json`, the machine-readable source of record, alongside
the human-readable renderings generated from it. The schema is published at
[bugpacker.com/report.schema.json](https://bugpacker.com/report.schema.json) and travels
inside every package, so a consumer behind an egress allowlist can validate a file it
was just handed without a network request.

This tool reads that schema and nothing else. It has no knowledge of the extension, and
it never makes a network request of its own.

## Licence

Apache-2.0. See [LICENSE](LICENSE).

Two assumptions are baked in: the npm install line assumes Node, and the last section assumes Apache-2.0. Change either and I will adjust.
