# How to save state

The standing instruction for ending a session in this repo, so a session starting cold,
with no conversation history, can resume without asking anything it could determine
itself. Run this when asked to save state, or before a pause.

## The instruction, as given

> Save state so a session starting cold in this repo, with no conversation history, can
> resume without asking me anything it could determine itself.
>
> **1. Record verified facts, not your recollection.** Anything external, the registry, the
> remotes, the published artifact, gets checked now and recorded with the date and the
> method. Anything you did not check, say so rather than omitting it.
>
> **2. Never point at this conversation.** If something only exists there, either write it
> out in full or record that it is lost. A cold session cannot read it.
>
> **3. State is not just what is left.** Record decisions and their reasons, what was ruled
> out and why, and anything I said not to do. A resumed session that knows only the
> remaining tasks will redo work I already rejected.
>
> **4. Say what is uncommitted, unpushed and unpublished, as three separate questions**,
> with what is in each.
>
> Then tell me what you wrote and what you could not verify.

**What rule 2 means, since the files outlive the chat that produced them.** "This
conversation" is the session transcript between Fletcher and Claude. It is not the files.
A resumed session can read every file in both repos and none of the chat, so:

- **Pointing at a file is good**, and preferred to repeating yourself: `README.md`,
  `CONTRIBUTING.md`, `CHANGELOG.md`, `NEXT.md`, a commit hash, a tag. All readable later.
- **Pointing at the chat is worthless.** "As discussed", "per the earlier decision",
  "recover the list from the conversation" are dead ends. That last one actually happened
  in this repo: a note said four items "were agreed but not restated, recover them from the
  original list", and there was nothing to recover.
- **If a fact exists only in the transcript**, write it out in full where it belongs, or
  record in plain words that it is lost. Do not leave a pointer standing in for it.

## The files, and how each session uses them

Read these in this order at the start of a session, before touching anything.

**1. `NEXT.md`, the working state.** What is true right now: what is published and
verified, what is decided, what is left. Untracked and gitignored, because this repo is
public and the file names local paths and unreleased work, so **it has no backup**. Its
"Standards" and "Spans both repos" sections exist verbatim in the extension repo's
committed `NEXT.md`, which is the recovery path if this copy is lost. Read it first, treat
its facts as dated rather than current, and update it whenever something is published,
verified or decided.

**2. `HOWTOSAVESTATE.md`, this file.** The procedure for ending a session. Also
gitignored: local process, not product.

**3. `README.md`, the product's own documentation.** What the tool does, how to install and
register it, and two sections that carry real weight: **"Not planned"**, which is where a
permanent decision goes with its reason so it is never relitigated, and the trigger
conditions written into it, such as `console --errors-only` waiting on the console
reaching `report.json`. A decision that belongs to users goes here, not only in `NEXT.md`.

**4. `CONTRIBUTING.md`, how to work on it.** Constraints a change has to respect, how to
run the suite, and **"Verifying a published version"**, which holds the A and B steps. Use
those exact commands after every publish; do not invent a shortcut, because a bare command
name or `npx` resolves through PATH to a global install and proves nothing.

**5. `CHANGELOG.md`, what shipped and why.** One section per release, written for someone
deciding whether to upgrade. Dates are the registry's publish date, not the day the text
was drafted. A published tarball keeps its own copy forever, so a correction here says the
old date shipped rather than quietly replacing it.

**6. `package.json`.** Carries the version **by hand**. Do not run `npm version`: it
rewrites the file's formatting and the lockfile, so the tag would point at a tree other
than the one packed and tested. `files`, `bin`, `engines` and the scripts are all load
bearing; `prepublishOnly` runs the suite, which is what makes a failing test abort a
publish before anything uploads.

**7. `SECURITY.md`, `CLA.md`, `NOTICE`, `LICENSE`.** Rarely touched. `SECURITY.md` asks
that a network request introduced into this package be reported as a vulnerability, which
is a commitment "No network access" in the README depends on.

**8. `.github/workflows/cla.yml`.** Fletcher's own commit, storing signatures on the
`cla-signatures` branch. Leave it alone.

**9. `test/`, and `dist/`.** The suite builds first, and `test/build-is-current.test.js`
fails when `src/` is newer than `dist/`, because `tsc` with `noEmitOnError` leaves a stale
`dist/` in place and a failed build otherwise reads as a passing run. `dist/` is
gitignored and is what ships, so never hand-edit it.

**The companion repo.** The Chrome extension lives in its own checkout, a sibling of this
one (`../bugpacker` in the usual layout). It holds the extension that
writes the packages this reads, its own `NEXT.md`, and its own copy of this file. Items
spanning both are in the "Spans both repos" section, word for word the same in both
copies. The extension half of a shared item ships first, because this tool reads what the
extension writes.

## Step 1: check the external world, now

Nothing here is trusted from memory or from an earlier answer in the session. Record the
date with each fact, and say which checks could not run.

**The registry, and the published artifact.** Read the tarball, not the registry's
metadata, and never through a bare command name or `npx`, which resolve through PATH to any
install that satisfies the spec, including a global one:

```sh
npm view bugpacker-cli dist-tags time --json
cd "$(mktemp -d)" && npm pack bugpacker-cli@<version> >/dev/null \
  && tar -xzf bugpacker-cli-<version>.tgz \
  && stat -f %Lp package/dist/index.js && ls package && head -6 package/CHANGELOG.md
```

That is step A of the two-step rule in `CONTRIBUTING.md`. Step B, proving it runs from a
scratch install by explicit relative path, is there too, and both are needed: A is the only
step that can see a mode defect, B is the only one that proves execution.

**The remotes and the local tree:**

```sh
git ls-remote --heads --tags https://github.com/fbonds/bugpacker-cli.git
git rev-list --left-right --count origin/main...main   # left = behind, right = unpushed
git status -sb
```

SSH to GitHub fails from Claude's sandbox with a publickey error, so read-only checks go
over HTTPS. That affects only what Claude can see, not what Fletcher can push. It also
means `origin/main` here may be stale: compare against `ls-remote`, not the tracking ref.

**The suite, and whether the build is current:**

```sh
npm test    # builds first; test/build-is-current.test.js fails if src/ is newer than dist/
```

**The MCP registration**, which is how this package is actually used:

```sh
claude mcp get bugpacker | head -5
npm ls -g --depth=0 | grep bugpacker
```

## Step 2: write it into `NEXT.md`

`NEXT.md` is the working state for this repo. **It is untracked and gitignored**, because
this repo is public and the file names local paths and unreleased work. It has no backup.
Its "Standards" and "Spans both repos" sections are duplicated verbatim in the extension
repo's committed `NEXT.md`, which is the recovery path; after editing either, prove they
still match:

```sh
diff <(awk '/^## Standards/{f=1} /^## This repo/{f=0} f' NEXT.md) \
     <(awk '/^## Standards/{f=1} /^## This repo/{f=0} f' ../bugpacker/NEXT.md) && echo identical
```

Anything that belongs to the published product rather than to local state goes in
`README.md`, `CHANGELOG.md` or `CONTRIBUTING.md` instead, where users can read it.

What the file has to contain:

- **Every external fact with its date and how it was checked**, and an explicit list of
  what was not checked.
- **Decisions and their reasons**: what was settled, what was ruled out and why, and
  anything Fletcher said not to do. A resumed session that sees only remaining tasks will
  rebuild something already rejected. The decisions that are permanent and public belong in
  the README under "Not planned", with the reason, rather than only here.
- **Uncommitted, unpushed and unpublished as three separate questions.** Do not write the
  unpushed answer as a list of commits: Fletcher pushes, not Claude, so it goes stale with
  no commit here to record it. Write the command that answers it plus a dated snapshot
  marked as not to be trusted.
- **Anything that exists only in the chat transcript, written out in full**, including any
  approved command surface or wording, verbatim rather than summarised.
- **What not to start unprompted**, where that was said.

## Step 3: check stored memories against the repo

Claude's stored memories load before any file is read, so a stale memory outranks a
correct `NEXT.md`. Two were wrong within one week: one said the `trackers` branch "rebases
onto free and becomes 2.1.0" when that branch held no commits `main` lacked and no tracker
code existed anywhere, and one described the MCP server as an `npm link` of the working
tree months after it became a pinned global install. Both would have sent a cold session
looking for things that were not there.

Read every stored memory for this project, compare each claim against the repo and the
checks above, and correct or delete what has drifted. A memory that names a file, a
branch, a flag or a version is checkable: check it rather than assuming it still holds.
Memories are for what the repo cannot say, such as how Fletcher wants to work and what is
true outside these directories; anything the files already answer belongs in the files.

Then name, in the report, which memories were checked and which were changed.

## Step 4: commit, and report

`NEXT.md` is gitignored, so there may be nothing to commit here at all. Whatever is
committed is staged explicitly by path and confirmed with `git diff --cached --stat`.
Never `git commit -am`. Do not push: Fletcher pushes. Never publish to npm unprompted.

Then say, in the reply: what was written and where, what was verified with the date, and
**what could not be verified**, naming each thing rather than omitting it.
