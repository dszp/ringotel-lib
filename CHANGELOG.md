# Changelog

All notable changes to `@dszp/ringotel-lib` are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.4] — 2026-07-20

### Added

- `assessUserHealth(user, { ext, suffix, siblingCount })` — pure classification of a Ringotel user
  record into deterministic health flags (`brick`, `authname-drift`, `duplicate`, `no-trunk`,
  `never-connected`, `tombstone`, `stale-registration`) plus a `severity`. Uses only fields already
  present on `getUsers`, so a consumer can assess a whole cached user list without an extra API call.
  `no-ns-device` is part of the exported vocabulary for consumers that also read a device list; it is
  never emitted by this function. Also exports `worstSeverity` and `HEALTH_SEVERITY`.

  Two behaviours worth knowing when consuming it: `stale-registration` is only reported for a record
  that actually has a trunk, so it never co-fires with `no-trunk` (one problem is reported once); and
  `never-connected` is deliberately conservative — `stime` is seeded at creation *and* bumped by admin
  API writes, so the flag under-reports rather than falsely accusing a record of being an unused seat.

## [0.1.3] — 2026-07-19

### Added

- **`resolveCanonicalUser(users, { ext, branchid, suffix })` — classify the records at one extension.**
  Pure and read-only: it decides, it does not mutate. Returns a verdict — `active` (exactly one record,
  activated), `inactive-exists` (exactly one, not activated), `none`, or `ambiguous` (more than one record
  at the extension) — plus the canonical pick and every match, so a caller can dedup. Because an app's SSO
  login binds by **extension number**, agreeing on "the canonical user at an extension" is what keeps two
  consumers from disagreeing and stranding an account; this puts that rule in one tested place. The
  canonical pick prefers the record carrying the SIP identity `<ext><suffix>`, then an **active** record,
  with most-recently-created only as the final tiebreak — and is left undefined when two records share the
  SIP identity, so an ambiguous case fails closed rather than guessing.

### Fixed

- **`RingotelApiError` detail is now truncated for object error bodies too.** Operator precedence meant the
  500-character cap bound only to the string branch, so a large structured upstream error was stringified
  in full into the message (and into any consumer that logs it).

## [0.1.2] — 2026-07-16

A hardening + packaging release. No breaking changes to the documented API.

### Security

- **The read-only guarantee is now enforced at runtime, not just by TypeScript.** `RingotelReadClient`
  and `RingotelWriteClient` held their `RingotelHttp` transport as a TS-`private` field, which is
  erased at runtime — so the fleet API key was reachable via `(readClient as any).http` (and a mutating
  `call()` could be issued through it). The transport and its token are ECMAScript `#private` now, so a
  read client handed to a less-trusted module genuinely cannot reach a write or the key. The package
  `exports` boundary (no deep import of the transport) already held; this closes the in-process gap.

### Fixed

- **Published `dist/` no longer points at source maps that were never shipped.** Every `.js`/`.d.ts`
  carried a `//# sourceMappingURL` comment while `files` excludes the maps, so consumers' devtools
  404'd. The publish build emits no pointer; a normal `pnpm build` still writes maps for `link:` consumers.
- **A prerelease can no longer be published as `latest`.** The release workflow derives npm's dist-tag
  from the version — prerelease ⇒ `next`, else `latest`.
- **`require()` gives an accurate error, or works.** Added `require`/`default` export conditions, so
  `require('@dszp/ringotel-lib')` works on Node ≥22.12 and reports `ERR_REQUIRE_ESM` on older Node
  instead of the misleading `ERR_PACKAGE_PATH_NOT_EXPORTED`.
- **The example override template no longer ships as dead weight.** `netsapiens.overrides.example.ts`
  was compiled into `dist/` but is not re-exported and the `exports` map blocks a deep import, so it
  was unreachable in the tarball. It's excluded from the published build now; the fictional template
  still lives in the repo source to copy from.

### Documentation

- `src/http.ts` described `RingotelWriteClient` as "a future" client; it shipped in 0.1.0. The comment
  ships in `dist/http.js`.
- README's usage example named the Ringotel client `ns`, which reads as NetSapiens in a library whose
  whole job is talking to Ringotel; and it claimed the published package ships the example override
  file, which it does not.

## [0.1.1] — 2026-07-16

### Fixed

- **`package.json` is now exported.** `exports` restricted the subpath map to `.`, so any consumer or
  tool reading `@dszp/ringotel-lib/package.json` — bundlers, version checks, some test runners — hit
  `ERR_PACKAGE_PATH_NOT_EXPORTED`. Added the conventional `"./package.json": "./package.json"`.

### Notes

- First release published by CI via **OIDC trusted publishing**, so this is the first version to carry
  a **provenance attestation**. (`0.1.0` was published by hand out of necessity: npm can only attach a
  trusted publisher to a package that already exists.)

## [0.1.0] — 2026-07-15

Initial public release.

### Added

- **`RingotelReadClient`** — read-only surface over the Ringotel AdminAPI JSON-RPC endpoint
  (`getOrganizations`, `getBranches`, `getUsers`, `getUser` with `devs[]`, SIP credentials, …).
- **`RingotelWriteClient`** — the sanctioned mutation surface (`createUser`, `attachUser`,
  `recoverDeletedUser`, …), deliberately a separate class over the same private transport.
- **`fetchOrgSnapshot` / `listOrganizations`** — gather an org (org + branches + users + contacts +
  SMS trunks) in a few parallel reads, tolerating gaps.
- **Mapping engine** — config-driven `source key → Ringotel org` resolution (`resolveOrgKey`,
  `resolveOrgId`, `resolveOrg`) with `NETSAPIENS_DEFAULT_TRANSFORM` for pattern-following NetSapiens
  domains, plus a fictional `netsapiens.overrides.example.ts` template.
- **Branch/directory helpers** — `resolveBranch`, `branchHost`, `matchHost`, `buildOrgBranchIndex`,
  `findByAddress`, `findByHost`. Pure and network-free.

### Notes

- **Zero runtime dependencies. Node-free**: the same built output runs unchanged in a Cloudflare
  Worker, in Node, and in the browser. `tsconfig` sets `types: []` and omits `@types/node`, so a stray
  `node:*` import fails the build.
- **The read-only guarantee is structural**, not conventional: the raw JSON-RPC transport is never
  exported, so a `RingotelReadClient` has no write method to call.
- `baseUrl` defaults to Ringotel's public shell endpoint and is overridable; nothing in this package
  is bound to a particular deployment.

[Unreleased]: https://github.com/dszp/ringotel-lib/compare/v0.1.4...HEAD
[0.1.4]: https://github.com/dszp/ringotel-lib/releases/tag/v0.1.4
[0.1.3]: https://github.com/dszp/ringotel-lib/releases/tag/v0.1.3
[0.1.2]: https://github.com/dszp/ringotel-lib/releases/tag/v0.1.2
[0.1.1]: https://github.com/dszp/ringotel-lib/releases/tag/v0.1.1
[0.1.0]: https://github.com/dszp/ringotel-lib/releases/tag/v0.1.0
