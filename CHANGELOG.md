# Changelog

Notable changes to `bugpacker-cli`. The Chrome extension that writes the packages this reads
is a separate product and is not covered here.

## 0.1.1 (unreleased)

Documentation, licensing and metadata. **No change to shipped code.** Nothing under `src/`
has changed since 0.1.0 was published on 2026-09-09, so the compiled output is the same.

### Added

- `LICENSE` (Apache-2.0) and `NOTICE`, with ownership stated in `package.json`.
- `CLA.md`, adapted from the Apache Software Foundation ICLA V2.2. Section 9 is additional
  and grants the right to relicense contributions, including under terms that are not open
  source. The differences from the ASF original are set out at the top of the document
  rather than left for a reader to find by diffing.
- `CONTRIBUTING.md`, including the constraints a change has to respect, and `SECURITY.md`.
- README: registration snippets for Claude Code, Cursor, Codex and Windsurf, each carrying
  the date that tool's own documentation was read; "What this does not do yet"; "Not
  planned"; what 1.0 would mean; and the Node versions this was tested against.
- This changelog.

### Changed

- `engines` is now `>=18`, was `>=20`. Node 20 reached end of life on 2026-04-30 and the old
  value pointed at an unsupported runtime. Neither number came from the code: the tool has
  no version-gated API call anywhere, and it was tested to pass on Node 16, 18, 20 and 22.
  The field is a floor, not a recommendation.
- `keywords` extended for discovery: `mcp-server`, `modelcontextprotocol`, `har`,
  `local-first`.
- Install instructions lead with `npx` instead of a global install.

### Fixed

- The README claimed the package format is "structured all the way down", and it is not.
  Console errors reach `report.json` as a step and a finding, so a comparison can read them.
  Warnings, log lines and CSP violations do not, and neither do subresource load failures
  for script, img and link, which never enter the HAR. The section now says which parts of
  its own promise work today.
- The README described what an agent does with the output as though this tool did it.
- `npm test` only worked on Node 22. The glob was quoted, and `node --test` did not expand a
  quoted glob itself until then, so on Node 16, 18 and 20 it exited 1 with `Could not find
  '<repo>/test/*.test.js'`. Unquoted now, so the shell expands it, and the suite runs on 18,
  20 and 22. `CONTRIBUTING.md` says why, and also that Node 16 collapses each file to a
  single test and so cannot be trusted to report a failure.

## 0.1.0 (2026-09-09)

First published release.

### Added

- Reads a Bugpacker package from local disk and prints it: `show`, `steps`, `console`,
  `network`, `har`, `files`, `json`, and `extract` for writing artifacts out.
- An MCP server over stdio, `bugpacker mcp <path>`, exposing seven tools to a coding agent:
  `list_packages`, `describe_bug`, `get_steps`, `get_console`, `get_network`, `list_files`
  and `get_file`.
- Scope is fixed by whoever launches the tool, at one package or one directory of them.
  Nothing the caller sends afterward can widen it, and the agent cannot supply a filesystem
  path at all.
- Anything that is not a Bugpacker package is refused rather than partly read. A package
  written by a newer extension than this understands is refused with a note to update,
  rather than read with its unknown fields guessed at.
- One runtime dependency, `fflate`, for reading the ZIP. No network request of any kind.
