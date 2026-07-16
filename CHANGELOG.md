# Changelog

All notable changes to `@dszp/ringotel-lib` are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[0.1.0]: https://github.com/dszp/ringotel-lib/releases/tag/v0.1.0
