# Contributing to bugpacker-cli

This is the reader for [Bugpacker](https://bugpacker.com) packages: a CLI and an MCP server
in one binary. The extension that produces those packages is a separate, closed-source
project and does not take code contributions. This repository does.

## Before a pull request can be merged

**You need to sign the Contributor License Agreement.** It is [CLA.md](CLA.md) in this
repository, adapted from the Apache Software Foundation ICLA V2.2, with one added section
granting the right to relicense contributions under other terms. Read section 9 in
particular before signing: it permits a future license change, including to terms that are
not open source.

There is nothing to print or post. The flow is:

1. Open your pull request as normal.
2. A bot comments on it asking you to agree to the CLA, and a CLA status check appears as
   failing.
3. Reply on the pull request with exactly this sentence, on its own, with nothing added:

   ```
   I have read the CLA Document and I hereby sign the CLA
   ```

4. The check goes green and review can start.

The sentence has to match exactly. An extra word or a trailing period will not register as
a signature, because the automation compares the comment against that string literally. If
the check does not update after a minute, comment `recheck`.

You sign once. Later pull requests from the same account are recognized automatically.

## What gets recorded

Your GitHub username, your user id, the pull request number and the time of your comment go
into `signatures/version1/cla.json` on the `cla-signatures` branch. That branch is public.

## Constraints a change has to respect

These are not style preferences. Each one is a claim made publicly, and a change that
breaks one is a change that makes a published document false.

**No command may take an arbitrary filesystem path.** Scope is fixed by whoever launches the
tool: one package, or one directory of them. Tools address packages by name inside that
scope. This is what makes the MCP server safe to register globally, and it is stated as such
in the README.

**No network requests, ever.** This tool reads a local file and prints. The README says it
makes no network request of any kind, and that is the point of it rather than a detail.

**One runtime dependency.** `fflate`, for reading the ZIP. The README says so. Adding a
second is a conversation before it is a pull request, not after.

**No second renderer for console, network or HAR output.** Those commands deliberately print
what the extension already rendered into the package, because those files draw distinctions
we would otherwise have to keep in step in two places. The reasoning is in
`src/commands/artifacts.ts` and it stands.

**Tests are generated, never committed.** A real capture is somebody's actual browsing
session and this repository is public. `.gitignore` says so.

## Running it

```sh
npm install
npm test        # builds first, then runs the suite
npm run build
```

`npm test` builds before it runs, and `noEmitOnError` is on. That is deliberate: `tsc` was
once emitting on a failed typecheck, which let a test run pass against a build that had not
compiled.

`test/build-is-current.test.js` fails the suite when any file in `src/` is newer than what
was compiled from it. That is what a failed `tsc` looks like from inside the suite, because
`noEmitOnError` leaves the previous `dist/` in place and every test file imports from there,
so a stale run reads as a pass. It lives in the suite rather than in the `npm test` script
because the script's `&&` already stops there; the gap is `node --test test/*.test.js` on its
own, a single test file, or a one-off `node dist/index.js` while verifying something.

**Node 18 or newer**, which matches `engines`. Two things about running the suite are worth
knowing before you lose an afternoon to either.

The test script passes its glob unquoted, so the shell expands it rather than `node --test`.
That is not a style choice. `node --test` did not expand a quoted glob itself until Node 22,
so the quoted form failed on 16, 18 and 20 with `Could not find '<repo>/test/*.test.js'`,
which reads as though the test files are missing rather than as though the runner cannot
expand a pattern. It exits 1, so nothing could have shipped past it, but the script was
written on Node 22 and not run anywhere else until 2026-09-13. Do not re-quote it.

Below 18 the suite does something worse than failing. Node 16 collapses each file to a single
test: `test/args.test.js` reports 1 where Node 18 reports 7, so an assertion failing inside a
file need not reach the summary. A green run on Node 16 is not a passing suite. The CLI
itself does run correctly there, which is why `engines` is a floor and this is a note about
the suite rather than about the tool.

## Verifying a published version

Two steps, and they answer different questions. Both are needed.

**A. Read the artifact.** No install, no PATH, no execution.

```sh
cd "$(mktemp -d)"
npm pack bugpacker-cli@<version>
tar -xzf bugpacker-cli-<version>.tgz
stat -f %Lp package/dist/index.js     # 755
ls package                            # NOTICE and CHANGELOG.md are here
```

**B. Prove it runs**, from a scratch project, by explicit relative path.

```sh
mkdir p && cd p && npm init -y
npm install bugpacker-cli@<version>
node -e "const p=require('path'),f=require('fs');const r=f.realpathSync('node_modules/.bin/bugpacker');if(!r.startsWith(process.cwd()))throw new Error('resolves outside the project: '+r);console.log('resolves inside the project')"
./node_modules/.bin/bugpacker --version
```

**Never verify with a bare command name or `npx`.** Both consult PATH and any install that
satisfies the version spec, including a globally linked development copy. An empty working
directory does not prevent this: it removes the local `node_modules` and leaves the global
link, which is where `npm link` puts things. That is how 0.1.1 was checked four separate ways
and shipped with a non-executable bin anyway; every check ran the linked working tree.

A is the only step that can see a mode defect, because `npm install` on npm 11.19.0 chmods a
non-executable bin to 0755 on the way in. B would pass against a broken tarball. A reads what
shipped; B proves what runs.

## Things worth opening an issue about first

A new dependency, a new command, a change to the package format this reads, or anything that
touches the fixed-scope rule. Those are design decisions rather than patches, and it is
cheaper to disagree in an issue than in a diff.

Bug reports, failing test cases, documentation fixes and small corrections need no
discussion first. Open the pull request.

## Security

Do not open a public issue for a vulnerability. See [SECURITY.md](SECURITY.md).
