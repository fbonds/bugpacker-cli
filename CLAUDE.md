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
- **No em dashes** in anything written, including files and commit messages.

**How to work.** One item at a time: show the diff and wait for approval. Stage explicitly
by path, confirm with `git diff --cached --stat`, and never `git commit -am`. **Never
push, and never publish to npm.** Fletcher does both.

**Constraints that are not preferences.** No new dependencies. No command that reads an
arbitrary filesystem path. No network access of any kind. The reasons are in the README
under "Not planned", and each is a promise someone may be relying on.
