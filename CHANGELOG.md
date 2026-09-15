# Changelog

Notable changes to `bugpacker-cli`. The Chrome extension that writes the packages this reads
is a separate product and is not covered here.

## 0.1.1 (2026-09-14)

Documentation, metadata, source maps that resolve, and one crash fix.

The crash is the reason to take this one. Every published version so far can be ended by a
single line of valid JSON from any client.

### Added

- **`network --failed`**, which drops the ad-blocked half of `network-errors.log` and keeps
  the requests that reached a server. It splits the extension's own rendering on the
  extension's own heading rather than re-deriving anything, and a package without that
  heading is an error rather than the whole file handed back unfiltered.

- **`diff`**, and a `compare_packages` MCP tool that names two packages in scope rather
  than taking paths. Compares environment, steps, console errors, network, form state, the
  marked element, counts and the file list field by field, and the rest of the console plus
  the subresource failures as lines of text, under a separate heading that says so.

  A section resolves what it can read from the package and reports the kind it found, so
  nothing is written for a structured console that does not exist and nothing breaks if one
  arrives. Proven rather than asserted: a synthetic package carrying a `console` array flips
  the section to `structured`, and that test fails against a build where the resolver is
  hardcoded.

  Requests match on method, origin and path. The query is excluded because redaction
  replaces a scrubbed one with a placeholder recording only how many parameters it removed,
  which is a property of the format rather than a shortcut here. A change in that number is
  reported, because the query changed even if what changed is not in the package.

- **`validate`**, and a `validate` MCP tool. Recomputes the SHA-256 and byte length of
  every artifact against what `report.json` records, checks the inventory both ways, and
  checks the totals the report states about itself. Exit `0`, `1` for a failure, `2` when
  there was no package to read. `--json` for CI, on this command only.

  Failures mean the package is not what `report.json` describes. Warnings print and leave
  the exit code alone: a report miscounting itself is an extension bug rather than a
  damaged package, and a check that turns CI red for one is a check CI learns to ignore.

  Verified against real tampered packages rather than fixtures alone. One byte changed in
  `console.log` of a real capture, repacked at the same length: the digest check fails
  alone and the other seven stay green.

  **It detects corruption, not forgery, and the documentation says so.** `report.json` is
  unsigned and describes itself, so a package whose artifact was altered along with the
  SHA-256 recorded for it passes every check. Confirmed by building that package. Nothing
  in the format can catch it: `manifest.json` records no digests, `fingerprint` is a
  deduplication key rather than a content hash, and the two metadata files carry
  deliberately different shapes of the same facts so neither witnesses the other. Stated in
  the README, in the module, and in the MCP tool description, which is the only
  documentation an agent ever reads.

- README: `json` and `--json` are different things, said in its own short section.
  `bugpacker json` is how you get the report and there is no second spelling of it;
  `--json` means a command's own output in machine-readable form, which only `validate`
  has.

- `LICENSE` (Apache-2.0) and `NOTICE`, with ownership stated in `package.json`.
- `CLA.md`, adapted from the Apache Software Foundation ICLA V2.2. Section 9 is additional
  and grants the right to relicense contributions, including under terms that are not open
  source. The differences from the ASF original are set out at the top of the document
  rather than left for a reader to find by diffing.
- `CONTRIBUTING.md`, including the constraints a change has to respect, and `SECURITY.md`.
- README: registration snippets for Claude Code, Cursor, Codex and Windsurf, each carrying
  the date that tool's own documentation was read; sections for the two new commands; what
  1.0 would mean; "Not planned", for the things that will not grow; and the Node versions
  this was tested against.
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

- **A flag meant for one command was accepted by every command and ignored.** `args.ts`
  validated flag names globally and knew nothing about which command took what, so
  `show pkg.zip --json` parsed cleanly, printed prose and said nothing. That is the same
  silent acceptance the file was written to prevent, one level up, and it arrived with the
  `--json` that `validate` needed. Flags are now declared per command, and a flag another
  command accepts says which one, so a dead end becomes a correction.

- **The MCP server could be killed by one line of valid JSON.** `serve()` called `handle()`
  outside any try, and `handle()` read `.method` off whatever `JSON.parse` returned. A line
  containing `null` threw a `TypeError`, ended the process, and took the agent's connection
  with it, presenting as the tool being unreliable rather than as a client sending nonsense.
  `42`, `"x"`, `[]` and `true` did not crash but fell through to a silent no-reply, which is
  its own defect. All of them are now answered with `-32600 Invalid Request`, which is what
  the JSON-RPC spec has that code for. The call to `handle()` is also wrapped, so an
  unexpected throw costs the one call and returns `-32603` rather than costing the transport.
  This is the layer the README asks you to register globally with a coding agent, so nothing
  a client sends may end the session.
- The README promised a `redactions` command showing "the placeholder mapping, from what the
  package already records". No such mapping is recorded, and none can be: it is keyed by the
  original values, so writing it into the package would hand back everything redaction
  removed. The entry is gone and `Not planned` now says what a future version could read,
  which is where placeholders appear, and what it never can, which is what they replaced.
- `validate` was described as checking a package "against the schema that travels inside
  it". That framing implied JSON Schema validation and a second runtime dependency to do it.
  Reworded to integrity and internal consistency, which is the half worth having.
- The README claimed the package format is "structured all the way down", and it is not.
  Console errors reach `report.json` as a step and a finding, so a comparison can read them.
  Warnings, log lines and CSP violations do not, and neither do subresource load failures
  for script, img and link, which never enter the HAR. The section now says which parts of
  its own promise work today.
- The README described what an agent does with the output as though this tool did it.
- Every shipped source map resolved to nothing. All seven carried `sources:
  ["../src/*.ts"]` with `sourcesContent` absent, while the `files` allowlist excludes `src/`,
  so a third of each install pointed at files that were not in it. `inlineSources` is on now,
  so the maps carry the TypeScript they map to. Verified by installing the tarball into a
  scratch project and triggering a real error: the trace resolves to `src/mcp.ts:257` and
  prints the source line with a caret, where before it could reach no further than
  `dist/mcp.js`. Node applies maps only under `--enable-source-maps`; without it you still
  get the `dist/` frame. `declarationMap` is off, so no `.d.ts.map` is emitted and the `.d.ts`
  files carry no dangling reference. Checked rather than assumed.
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
