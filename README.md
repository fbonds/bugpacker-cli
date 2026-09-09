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
reader for the file you already have.

Same feature, opposite data path. The agent gets the console error, the failing request
and the repro steps; nobody else gets anything.

## Install

```sh
npm install -g bugpacker-cli
```

## Use it from a terminal

```sh
bugpacker show <package.zip>       # everything, summarised
bugpacker steps <package.zip>      # repro steps, expected and actual
bugpacker console <package.zip>    # console output, uncaught errors, CSP violations
bugpacker network <package.zip>    # failed requests, kept apart from ad-blocked noise
bugpacker har <package.zip>        # the full session as HAR
bugpacker files <package.zip>      # what is in the package
bugpacker json <package.zip>       # report.json, for piping into something else
```

Pull artifacts out when you want them as files:

```sh
bugpacker extract <package.zip> --out ./bug           # everything
bugpacker extract <package.zip> network.har --out .   # just one
```

The HAR is the usual reason: it is worth little in a terminal and a lot in DevTools,
which needs it on disk.

## Use it from a coding agent

```sh
bugpacker mcp <package.zip>      # one bug
bugpacker mcp ~/Downloads        # every package in a directory
```

Starts an MCP server over stdio. The agent gets `describe_bug`, `get_steps`,
`get_console`, `get_network`, `list_files` and `get_file`, plus `list_packages` when
serving a directory.

Register it with Claude Code:

```sh
claude mcp add bugpacker -- bugpacker mcp ~/Downloads
```

Then ask it to fix the bug, and it reads the console error, the failing request and the
repro steps out of the file itself.

### What the agent cannot do

**It never supplies a filesystem path.** The scope is fixed when you launch the server:
one package, or one directory. Tools address packages by name inside that scope, and a
name that tries to climb out of it is stripped and then rejected.

That is deliberate. A tool taking a path would be more flexible and would also let a
model read any file you can, which is not a trade worth making for a tool whose whole
point is that your bug data stayed put.

### No SDK

The transport is written against the protocol directly. The official SDK pulls express,
hono, cors, jose and eventsource to support HTTP and OAuth transports a stdio server
never touches; this package has one dependency, and a tools-only server needs four
methods of JSON-RPC.

## Why some commands just print

`console`, `network` and `har` print what the extension already rendered rather than
building a second view of the same data. Those files draw the distinction that matters
most in them, between a request that reached a server and failed and one an ad blocker
killed before it left the browser, and a second renderer here would be one more thing
to keep in step with a format this repo does not own.

## The format

Every package contains `report.json`, the machine-readable source of record, alongside
the human-readable renderings generated from it. The schema is published at
[bugpacker.com/report.schema.json](https://bugpacker.com/report.schema.json) and travels
inside every package, so a consumer behind an egress allowlist can validate a file it
was just handed without a network request.

This tool reads that schema and nothing else. It has no knowledge of the extension, and
it never makes a network request of its own.

A package written by a newer extension than this CLI understands is refused with a note
to update, rather than read with its unknown fields guessed at. An older one is read as
it is.

## Develop

```sh
npm install
npm run build
npm test
```

## Licence

Apache-2.0. See [LICENSE](LICENSE).
