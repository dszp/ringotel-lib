# @dszp/ringotel-lib

Portable, **Node-free** toolkit for the **Ringotel AdminAPI**. The same built code runs unchanged in a
Cloudflare Worker, in Node, and in the browser (Web `fetch` only, zero runtime dependencies).

Built to the same pattern as [`@dszp/netsapiens-lib`](https://github.com/dszp/netsapiens-lib), so a
single consumer can compose both to talk to NetSapiens and Ringotel.

## What it does

- **`RingotelReadClient`** — the read-only surface over the AdminAPI's JSON-RPC endpoint
  (`getOrganizations`, `getBranches`, `getUsers`, `getUser` with its `devs[]` devices, SIP creds, …).
- **`RingotelWriteClient`** — the mutation surface: 24 methods across users, orgs, branches and
  devices (`createUser`, `attachUser`, `setUserPassword`, `resetUserPassword`, …). A **separate class**
  from the read client, on purpose — see below.
- **`fetchOrgSnapshot` / `listOrganizations`** — gather an org (org + branches + users + contacts +
  sms trunks) in a few parallel reads, tolerating gaps.
- **Mapping engine** — a generic, config-driven `source key → Ringotel org` resolver
  (`resolveOrgKey` / `resolveOrgId` / `resolveOrg`) with a NetSapiens default transform. Auto-maps
  pattern-following NS domains (`demo.12345.service` → `demo`); overrides handle the exceptions.

### Reads and writes are two classes — and that's the safety property

This package **can** write. What it guarantees is that you choose: `RingotelReadClient` has no mutation
method on it at all.

The Ringotel AdminAPI is a single JSON-RPC endpoint (`POST /api` with `{method, params}`), so it can't
be gated at the transport the way a REST client can hardcode `GET` — `call('deleteUser', …)` is always
physically possible on the core. So the guarantee is **encapsulation**: the raw transport
(`RingotelHttp`) is **never exported**, and is held privately inside each client. Want read-only?
Construct a `RingotelReadClient` and there is literally nothing else to call. A type-level test
(`pnpm typecheck`) asserts it stays that way.

## Usage

```ts
import { RingotelReadClient, resolveOrg, fetchOrgSnapshot } from '@dszp/ringotel-lib';

const ns = new RingotelReadClient({ token: process.env.RINGOTEL_API_KEY! });
const orgs = await ns.getOrganizations();

// Map a NetSapiens domain to its Ringotel org, then snapshot it.
const org = resolveOrg('demo.12345.service', orgs);        // → { id, domain: 'demo', … }
const snap = await fetchOrgSnapshot(ns, org!.id);
```

### Mapping config

The published lib ships only the generic engine + `NETSAPIENS_DEFAULT_TRANSFORM` and a **fictional**
`src/netsapiens.overrides.example.ts`. Supply your real override table from your consumer via
`MappingConfig` (preferred), or copy the example to a gitignored `src/netsapiens.overrides.local.ts`
(excluded from the package). **Never commit real customer mappings.**

```ts
import { resolveOrg, NETSAPIENS_DEFAULT_TRANSFORM, type MappingConfig } from '@dszp/ringotel-lib';

const cfg: MappingConfig = {
  rules: [{ match: 'acme42', to: 'acmevoice' }],   // your overrides (from the consumer)
  defaultTransform: NETSAPIENS_DEFAULT_TRANSFORM,
};
const org = resolveOrg('acme42', orgs, cfg);
```

## Install

```
npm install @dszp/ringotel-lib      # or: pnpm add / yarn add
```

ESM-only, zero runtime dependencies, ships its own types.

## Develop

**Package manager: pnpm.** No runtime dependencies.

```
pnpm install
pnpm build         # tsc → dist/ (dist/index.js + dist/index.d.ts)
pnpm test          # vitest (unit; mock fetch)
pnpm typecheck     # tsc -p tsconfig.test.json (incl. type-level read/write surface assertions)
```

`dist/` is gitignored (build output, regenerated for `link:` consumers and on publish). The build has
no `@types/node` and `tsconfig` sets `types: []`, so a stray `node:*` import fails `pnpm build` — that
is the portability guarantee.

### Live smoke test (real API, read-only)

An env-gated vitest file (`*.live.test.ts`) self-skips unless `RINGOTEL_API_KEY` is set, so `pnpm test`
is green out of the box with no credentials. Source the key from your secret manager at run time —
never commit it:

```
RINGOTEL_API_KEY=... pnpm test
```

## API reference

Unlike a REST wrapper, this library **enumerates** the AdminAPI calls it covers: the JSON-RPC
transport is private, so a method here is the only way to reach a method there. If a call you need is
missing, it needs adding — that's the trade for the read-only guarantee being structural.

### `RingotelReadClient` — 22 calls, no way to mutate

| Area | Methods |
|---|---|
| Organizations | `getOrganizations()` · `getOrganization(id)` · `getAccount()` · `getAccountUsers()` · `getAccountStatistics(begin, end)` |
| Branches | `getBranches(orgid)` · `getBranch(id, orgid)` · `getBranchOptions(id, orgid)` |
| Users | `getUsers(orgid, branchid?)` · `getUser(id, orgid)` · `getUserLogs(userid, domain)` · `getUserRegistrationsHistory(orgid, userid, begin?, end?)` |
| Devices / SIP | `getSIPCredentials(orgid, userid, protocol?, termpass?)` |
| Contacts | `getContacts(orgid)` · `getBlockedContacts(orgid)` · `getPhoneBookURL(orgid, userid, format)` |
| Catalog | `getTemplates()` · `getRegions()` · `getPackages()` · `getServices(orgid)` |
| Messaging | `getSMSTrunks(orgid)` · `getAgents(orgid)` |

### `RingotelWriteClient` — 24 calls, a separate class on purpose

| Area | Methods |
|---|---|
| Users | `createUser` · `createUsers` · `updateUser` · `deleteUser` · `deleteUsers` · `deactivateUser` · `recoverDeletedUser` |
| User linking | `attachUser` · `detachUser` |
| User state | `setUserStatus` · `setUserState` · `setUserPassword` · `resetUserPassword` · `setUserSettings` |
| Devices | `resyncSIPDevice` · `deleteDevice` |
| Organizations | `createOrganization` · `updateOrganization` · `deleteOrganization` · `setOrganizationStatus` |
| Branches | `createBranch` · `updateBranch` · `deleteBranch` · `setBranchStatus` |

Two AdminAPI behaviors worth knowing before you reach for these, because the names mislead:
`attachUser` **links two existing users** (an unactivated one to an activated one) rather than adding a
user to anything; and `createUser` **registers** a user, which is not the same as provisioning a
device. See the method doc comments.

### Helpers (pure, no network)

`fetchOrgSnapshot(client, orgid)` · `listOrganizations(client)` · `resolveOrg` / `resolveOrgId` /
`resolveOrgKey` · `NETSAPIENS_DEFAULT_TRANSFORM` · `buildOrgBranchIndex` · `findByAddress` /
`findByHost` · `resolveBranch` / `resolveBranchOrThrow` · `branchHost` / `matchHost`

## Docs

- **[ARCHITECTURE.md](./ARCHITECTURE.md)** — module boundaries, why the read-only guarantee is
  encapsulation rather than convention, and why caching is a consumer concern.
- **[CONTRIBUTING.md](./CONTRIBUTING.md)** — the rules: fictional fixtures, no deployment-binding
  defaults, doc comments are published API, Node-free.
- **[CHANGELOG.md](./CHANGELOG.md)**

## License

[MIT](./LICENSE) © David Szpunar
