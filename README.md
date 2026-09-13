# bugpacker-cli

Read a [Bugpacker](https://bugpacker.com) bug package from disk, on the command line or
over MCP.

Bugpacker is a Chrome extension that records a bug while you reproduce it and saves a
single ZIP: screenshots, console output, failed requests, a HAR, the DOM, the state of
every form field, and the steps you took. Nothing it captures leaves your machine.

This is the tool that reads one back.

> **Status:** 0.1.0, the first release. The package format it reads is stable and
> published; this reader is new. Expect the surface to move before 1.0, which is the point
> at which the command names and the MCP tool names stop changing.

## Why it exists

Jam, BugHerd and Usersnap can all hand a coding agent your bug report, because the
capture is already on their servers.<sup>1</sup> Bugpacker's is a file on your disk, so it
needs a different route: a local reader for the file you already have.

The agent gets the console error, the failing request and the repro steps, read off your
disk. Neither the extension nor this reader sends anything anywhere.

What your agent does with it afterwards is yours to decide, and worth being explicit about
if you are behind an egress allowlist: anything you hand to a cloud-hosted agent goes to
that agent's provider. Point a local model at it and it goes nowhere at all.

<sup>1</sup> The five products compared on
[bugpacker.com/compare](https://bugpacker.com/compare) all store captures on their own
servers; three of them publish agent access. Each cell there cites the vendor's own page
and the date it was read.

## Install

Try it without installing anything:

```sh
npx bugpacker-cli show <package.zip>
```

Install it when you want it on your `PATH`, which is what the agent setups below assume:

```sh
npm install -g bugpacker-cli
```

`npx` fetches from the registry on first run. If you are behind an egress allowlist, install
once and it never touches the network again.

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

Then ask it to fix the bug, and it reads the console error, the failing request and the
repro steps out of the file itself.

### Registering it

Each snippet below was checked against that tool's own documentation, linked with the date
it was read. Swap `~/Downloads` for wherever you keep packages, or name a single `.zip` to
scope it to one bug.

**Claude Code** ([docs](https://docs.claude.com/en/docs/claude-code/mcp), read 13 September 2026)

```sh
claude mcp add bugpacker -- bugpacker mcp ~/Downloads
```

**Cursor** ([docs](https://cursor.com/docs/context/mcp), read 13 September 2026) — `~/.cursor/mcp.json` for every
project, or `.cursor/mcp.json` in one project.

```json
{
  "mcpServers": {
    "bugpacker": { "command": "bugpacker", "args": ["mcp", "~/Downloads"] }
  }
}
```

**Codex** ([docs](https://developers.openai.com/codex/mcp), read 13 September 2026) — a command rather than a file:

```sh
codex mcp add bugpacker -- bugpacker mcp ~/Downloads
```

It writes to `~/.codex/config.toml`, which is TOML rather than JSON and is the only format
Codex accepts. To edit it by hand:

```toml
[mcp_servers.bugpacker]
command = "bugpacker"
args = ["mcp", "~/Downloads"]
```

**Windsurf** ([docs](https://docs.windsurf.com/windsurf/cascade/mcp), read 13 September
2026) — `~/.codeium/windsurf/mcp_config.json`, same shape as Cursor's.

```json
{
  "mcpServers": {
    "bugpacker": { "command": "bugpacker", "args": ["mcp", "~/Downloads"] }
  }
}
```

On the date above, that documentation URL redirects to `docs.devin.ai`, and the page it
lands on scopes this configuration to the Cascade agent, describing the Devin Local agent as
using different files. If your install reads its config from somewhere else, check the
current page. The `mcpServers` block itself is the same shape either way.

**Anything else that speaks MCP.** Most clients take the same shape in some JSON file of
their own:

```json
{
  "mcpServers": {
    "bugpacker": { "command": "bugpacker", "args": ["mcp", "~/Downloads"] }
  }
}
```

If your client resolves commands without your shell's `PATH`, give it the absolute path
from `which bugpacker`. To skip the global install entirely, use `"command": "npx"` with
`"args": ["-y", "bugpacker-cli", "mcp", "~/Downloads"]`, at the cost of a registry fetch
the first time the server starts.

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

## License

Apache-2.0. See [LICENSE](LICENSE).
