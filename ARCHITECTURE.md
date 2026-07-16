# Architecture

Why this library is shaped the way it is. For the rules of contributing, see
[CONTRIBUTING.md](./CONTRIBUTING.md).

## Module boundaries

| File | Role | Portable? |
|---|---|---|
| `model.ts` | Types: RPC envelope + loose entity types (`Organization`, `Branch`, `User` w/ `devs[]`, …). | ✅ |
| `http.ts` | `RingotelHttp` transport core + `RingotelApiError`. The one choke point. **Not exported.** | ✅ |
| `readClient.ts` | `RingotelReadClient` — read-only surface (`get*` only), holds `RingotelHttp` privately. | ✅ |
| `writeClient.ts` | `RingotelWriteClient` — the mutation surface. | ✅ |
| `snapshot.ts` | `fetchOrgSnapshot`, `listOrganizations` — gather helpers over the read client. | ✅ |
| `mapping.ts` | Generic source→org mapping engine + `NETSAPIENS_DEFAULT_TRANSFORM`. | ✅ |
| `branch.ts` / `directory.ts` | Pure, network-free branch resolution and org/branch indexing. | ✅ |
| `netsapiens.overrides.example.ts` | **Fictional** mapping template to copy. | ✅ |
| `index.ts` | Public barrel — everything except `RingotelHttp`. | ✅ |
| `testkit.ts` | Mock JSON-RPC `fetch` for tests. **Excluded from the build**, never ships. | dev |
| `*.test.ts` | vitest units (mock fetch); `*.live.test.ts` is env-gated. **Excluded from the build.** | dev |

## The read-only guarantee is encapsulation, not convention

A JSON-RPC API can't be gated at the transport the way a REST client can hardcode `GET`: there is one
endpoint (`POST /api` with `{method, params}`), so `call('deleteUser', …)` is always *physically*
possible on the core. Restricting the verb buys nothing.

So the guarantee is structural. `RingotelHttp` is `private` inside each client and **never exported
from the barrel**. Reads are `RingotelReadClient`, whose surface simply has no mutating method to
call; writes are a separate `RingotelWriteClient`. A type-level test (`writeClient.test.ts`, checked
by `pnpm typecheck`) asserts the read client exposes no write methods.

Want read-only? Construct a `RingotelReadClient` and there is literally nothing else on it.

**Therefore:** never export `RingotelHttp`, never merge the two classes, and never add a generic
`call()` escape hatch to the read client. Any of those silently converts a structural guarantee back
into a convention.

## Mapping: mechanism here, real data in the consumer

`mapping.ts` is a generic `source key → org` engine. The only NetSapiens-specific piece is
`NETSAPIENS_DEFAULT_TRANSFORM` (take the first label, so `demo.12345.service` → `demo`), which makes
pattern-following domains map with no configuration at all.

Real override tables are **data, not code**, and they're somebody's customer list. They must not live
in published source. Supply yours from your own consumer via `MappingConfig`, or copy
`netsapiens.overrides.example.ts` to a gitignored `src/netsapiens.overrides.local.*` (excluded from
the package).

## Caching is a consumer concern

There is deliberately no response cache in this library. Three reasons, and they compound:

1. **Cache backends are environment-specific** — the Cloudflare Cache API, KV, or a Durable Object; a
   `Map` in Node; storage in a browser. Baking one in would forfeit the portability that is this
   package's entire point.
2. **Invalidation is policy**, and it's coupled to write flows — which live in the consumer, not here.
3. **Standard HTTP caching doesn't apply.** This is a POST-only JSON-RPC API: every call is
   `POST /api`, so there's no URL to key on. A cache must key on a hash of `{method, params}`, which
   is a decision the consumer is better placed to make than we are.

The seam is the injectable `fetchImpl`: wrap `fetch` with your own cache (keyed on the request body)
and pass it to the read client. Don't add a cache layer here unless a `CacheAdapter`-style seam proves
necessary across several independent consumers.

## Node-free by construction

The same built output runs unchanged in a Cloudflare Worker, in Node, and in the browser. That's not
aspirational — `tsconfig.json` sets `"types": []` and omits `@types/node`, so a stray `node:*` import
fails `pnpm build`. Zero runtime dependencies, Web APIs only (`fetch`, `atob`, `TextDecoder`,
`crypto.subtle`).
