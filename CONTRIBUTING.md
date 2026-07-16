# Contributing to `@dszp/ringotel-lib`

Bug reports, ideas, and pull requests are welcome. This library is small and opinionated; the rules
below are the opinions, and they exist for concrete reasons rather than taste.

## Getting started

**Package manager: pnpm.** No runtime dependencies — please keep it that way.

```
pnpm install
pnpm build         # tsc → dist/ (dist/index.js + dist/index.d.ts)
pnpm test          # vitest — must pass with NO credentials and no setup
pnpm typecheck     # tsc -p tsconfig.test.json (incl. type-level read/write surface assertions)
```

`pnpm test` must be green on a fresh clone with no environment variables set. The one live test
(`*.live.test.ts`) self-skips unless `RINGOTEL_API_KEY` is present. If you add a test that needs
credentials, gate it the same way.

## The rules

### 1. Fixtures and examples must be fictional

Every domain, host, org, person, phone number, and identifier in this repo — in code, comments,
tests, and the README — must be invented or reserved. No exceptions, including "just for a moment
while I debug."

Use [RFC 2606](https://www.rfc-editor.org/rfc/rfc2606) reserved names:

| Use | Prefer |
|---|---|
| domains / hosts | `example.com`, `example.net`, `example.org`, `*.example` |
| orgs / tenants | `acme`, `acme42`, `acmevoice`, `demo` |
| NetSapiens domains | `acme`, `testco` (bare) — or `demo.12345.service` when a suffix is the point |
| people | `Jane`, `j@x.co` |
| phone numbers | `555-01xx` ([RFC 3849](https://www.rfc-editor.org/rfc/rfc3849) / fictional-use ranges) |

**A NetSapiens domain is an opaque string — an identifier, not parseable data.** A domain may be
**bare** (`acme`) or carry a **territory suffix** (`acme.12345.service`); both are legitimate and they
coexist in a single scope. Because NetSapiens domains **cannot be renamed**, two things are permanently
true: a suffix may simply be **absent**; and a suffix **doesn't identify the owner** — domains move
between scopes keeping the name and suffix they were created with, so one scope routinely spans several
different suffixes. The suffix records where a domain was created, not who holds it now.

So never infer ownership or scope from a domain string, and never require a suffix. That's exactly why
`NETSAPIENS_DEFAULT_TRANSFORM` takes the **first label** instead of parsing one: `demo.12345.service` →
`demo`, and a bare `acme` → `acme`, unchanged. Both must keep working.

**`branch.address` is the authoritative binding — the org name is not.** A Ringotel branch's
`address` must equal the NetSapiens domain **exactly** (modulo a trailing `:port` and case), whatever
shape that domain has. That's what makes `findByAddress` a definitive NS→(orgid, branchid) resolution,
and it's the path to reach for.

The Ringotel *org* name is incidental: it may match the domain, may drop the suffix, or may be
something else entirely, and nothing should depend on it. `mapping.ts` exists for consumers resolving
an org from some other source key when they don't have a branch address to match — it is not the
NS-domain path.

Never feed a transformed or first-label form to `findByAddress`. The address match is exact by design:
accepting `demo` for an address of `demo.12345.service` would let a domain bind to an org it merely
resembles.

`src/netsapiens.overrides.example.ts` is the reference for what good looks like.

### 2. No real customer data, ever

Not in code, comments, tests, the README, **or a commit message**. That includes real customer names,
domains, DIDs, carrier hostnames, tenant IDs, account identifiers, and email addresses. Snapshots and
org listings pulled from a live API are customer data — never paste them into an issue, a PR, or a
fixture.

If you need a real value to reproduce a bug, describe its *shape* (`a 3-label domain whose first
label collides with another org`), not the value.

### 3. No defaults that bind the library to one deployment

A default that encodes *someone's specific* server, tenant, issuer, or brand is a bug, not a
convenience — it silently couples every other consumer to a stranger's infrastructure.

`baseUrl` defaulting to Ringotel's own public endpoint is fine: it is the vendor's documented
endpoint, true for everyone, and overridable. `token` being required is correct. Apply that test to
any new default you're tempted to add.

### 4. Branding arrives at runtime, never in source

White-label and display names belong in the consumer's configuration, not in this package. The
library says "Ringotel" — the vendor — and nothing about how anyone re-brands it.

### 5. Doc comments are published API

They ship in `dist/*.d.ts` and surface on IDE hover for every consumer of this package. A comment
here is as public as a function signature. Write them for a stranger, and never park context in them
that you would not put in the README.

### 6. Keep it Node-free

Never import `node:*` (`fs`, `path`, `crypto`, `Buffer`, …) anywhere in `src/`, except `*.test.ts`
files, which are excluded from the build. Use Web APIs — `fetch`, `atob`, `TextDecoder`,
`crypto.subtle`.

This is enforced structurally: `tsconfig.json` sets `"types": []` with no `@types/node`, so a stray
`node:*` import fails `pnpm build`. Please don't add `@types/node` to make an error go away — the
error is the feature. It's what lets the same built output run in a Cloudflare Worker, in Node, and
in the browser.

### 7. Read and write stay two classes over one private transport

`RingotelHttp` is never exported. `RingotelReadClient` has no write methods — not by convention, but
because there is literally nothing to call. That's the whole safety property: never merge the two
classes, and never export the transport.

## Pull requests

- One logical change per PR; include a test.
- Run `pnpm build && pnpm test && pnpm typecheck` before opening.
- Add a `CHANGELOG.md` entry under "Unreleased" for anything user-visible.
- Public API changes need a note on why the surface should grow — this library aims to stay small.
