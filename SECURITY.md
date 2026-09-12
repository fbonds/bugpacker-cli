# Security policy

## Reporting a vulnerability

Email **hello@bugpacker.com**. Do not open a public issue.

Include what you need to: the version, what you did, what happened, and what you expected.
A proof of concept helps and is not required.

This is a one-person project. One person reads that mailbox, there is no on-call rotation,
and there is no service level to promise.

You are welcome to disclose publicly on your own timeline. A note beforehand is appreciated
so a fix can go out alongside it, but it is a courtesy rather than a condition.

## What this tool does, which bounds most of the surface

`bugpacker-cli` reads a Bugpacker package from local disk and prints. It makes no network
request of any kind, opens no socket, and has one runtime dependency.

Two properties are worth knowing before reporting, because they are the design rather than
oversights:

**Scope is fixed at launch, not by the caller.** The person starting the tool names one
package or one directory. Nothing the tool accepts afterward can widen that. Package names
are resolved with `basename` and then checked for membership in the scope, so a name that
tries to climb out fails rather than escaping. If you find a path that does escape the
scope, that is a vulnerability and worth reporting.

**The MCP server speaks JSON-RPC over stdio and is not reachable over a network.** It
listens on no port. The agent connected to it cannot supply a filesystem path; it addresses
packages by name within the fixed scope.

## In scope

Escaping the fixed scope, whether by package name, artifact name, archive entry name or
symlink. Writing outside the directory given to `extract`. Anything that causes a network
request. Code execution from opening a malicious package. Crashes that a malformed package
can cause in a caller that trusts our output.

A malicious package is a realistic input: a package is a file somebody sends you. Treating
one as untrusted is correct and reports in that area are welcome.

## Out of scope

The contents of a package you were sent, including anything the extension failed to redact.
Redaction happens in the Chrome extension before the package is written, and it is best
effort by design. That belongs to the extension, not here, and the same address will reach
someone who can act on it.

Vulnerabilities in `fflate`, Node, or your operating system. Report those upstream, though a
heads-up here is welcome if this tool's use of them makes an upstream issue worse.

## Supported versions

The latest published version on npm. There are no backports.
