# Working in this repo

**Read `NEXT.md` first.** It is the working state: what is published and verified, what is
decided, what is left. It is untracked and gitignored, because this repo is public, so a
fresh clone will not have it; if it is missing, say so rather than guessing, and rebuild
from `README.md`, `CHANGELOG.md`, `CONTRIBUTING.md` and the git log.

**Treat its facts as dated, not current.** npm, GitHub and the MCP registration move
without a commit here to show it. The block at the top of `NEXT.md` has the commands that
re-check them. Stored memories load before any file is read and go stale the same way, so
check those against the repo too.

**The standards are written down.** `NEXT.md` has them under "Standards", and
`HOWTOSAVESTATE.md` has the procedure for verifying state and saving it at the end of a
session, plus what each file here is for. Four that come up constantly:

- **No check counts as verified until it has been shown failing** on deliberately broken
  input, and the report says what was broken.
- **Check claims against the artifact:** read the published tarball, not the registry's
  metadata or the CHANGELOG.
- **Never verify through a path a global install can satisfy.** No bare command name, no
  `npx`. `CONTRIBUTING.md` has the two steps that do it properly.
- **Say what was not checked**, rather than leaving it out. An omission reads as a
  verified negative.

## Writing

Applies to user-facing prose and to how you write to Fletcher. This repo's README,
CHANGELOG and CONTRIBUTING are read by strangers, so most of its prose is public.

These are the patterns that read as machine-written. The September 2026 rewrite of the
project's site turned on them: the first item alone appeared dozens of times.

- **No "not X, it's Y" reframes.** State what it is.
- **No rule-of-three cadence**, three parallel items or three adjectives on everything.
- **No trailing participial clauses** that tack a conclusion onto a fact: "making it easier
  to X", "ensuring Y stays consistent".
- **No "that said" or "with that said" pivots.** Use "but".
- **No "here's the thing" or "the thing is" lead-ins.**
- **No rhetorical questions as transitions.**
- **No bolded mini-header on every bullet** where prose works.
- **No "not only... but also".** Use "and".
- **No summary sentence** restating what was just read.
- **No unprompted "think of it like" analogies.**
- **No "X is where Y matters" constructions.**
- **No emoji or checkmark decoration** in headers or lists.
- **Prefer short declaratives** over clause-heavy sentences.
- **No em dashes**, anywhere: chat, files, commit messages, product copy.
- **Say what a thing does** rather than performing it.
- **No preamble** summarising what you are about to say, and no restating the request
  before answering it.

**How to work.** One item at a time: show the diff and wait for approval. Stage explicitly
by path, confirm with `git diff --cached --stat`, and never `git commit -am`. **Never
push, and never publish to npm.** Fletcher does both.

**Confirm where you are before acting.** Say which repo or working directory you are in,
and challenge it if it looks like the wrong one for the work being asked for. This project
is two checkouts with similar names, `bugpacker-cli` and `bugpacker`, and acting in the
wrong one is easy and expensive.

**Do not guess.** Check. If something cannot be checked from here, say that, rather than
reasoning your way to a plausible answer and presenting it as one. "I could not verify
this" is a usable answer; a confident wrong one costs the rest of the session's trust.

**Constraints that are not preferences.** No new dependencies. No command that reads an
arbitrary filesystem path. No network access of any kind. The reasons are in the README
under "Not planned", and each is a promise someone may be relying on.
