# ROADMAP — @dszp/ringotel-lib

The read-only surface is the first deliverable and is done (client + snapshot + mapping, unit-tested).
What follows.

## Phase 2 — Write client (near-term; writes are the real payoff)

Fill out `RingotelWriteClient` on the shared `RingotelHttp` core, one verified method at a time, each
with a test and each exercised against a **throwaway Ringotel demo org** before it's trusted:

- Users: `updateUser`, `deleteUser`, `detachUser`, `setUserStatus`, `setUserState`,
  `setUserPassword` / `resetUserPassword`, `createUsers` (bulk), `deleteDevice`, `resyncSIPDevice`.
- Orgs / branches: `createOrganization`, `updateOrganization`, `setOrganizationStatus`,
  `createBranch` / `updateBranch` (the large `provision` blob).
- Contacts / SMS: `importContacts`, `updateContacts`, `createSMSTrunk`, opt-out management.

Design invariants to keep:
- **Mechanism here, policy in the consumer.** No allowlists / confirmation prompts baked into the lib;
  the consumer owns those.
- Read and write stay **two classes** over one private transport. Never merge them; never export
  `RingotelHttp`; never add a generic `call()` to the read client. The `pnpm typecheck` type-level
  assertion (read client has no write methods) guards this.
- Verify param shapes against the Postman collection + a live demo org, not from memory.

## Phase 3 — Mapping completeness

- Consumer wires the real NS→Ringotel override table (from the current n8n mapping workflow) via
  `MappingConfig` — or a gitignored `src/netsapiens.overrides.local.ts`. Nothing real in published source.
- Consider a `resolveOrgId` variant that fuzzy-matches when the middle `#####` differs, if the
  overrides table grows unwieldy.

## Phase 4 — MessagingAPI module (later; for completeness)

Same transport shape (`POST /api`, Bearer, `{method, params}`, `result`/`error`) but a thinner API:
`getChatUsers`, `message` (send text/file/indication), plus inbound **webhook** notifications
(`message`/`delivered`/`read`/`typing`/…). Add as a separate module so the AdminAPI surface stays
focused; reuse `RingotelHttp` and `RingotelApiError`.

## Publishing

Before any public publish: pick a real license (currently `UNLICENSED`), validate the package boundary
with `pnpm pack --dry-run` (only `dist/` + `README.md`; no `node:*` in `dist/`), and use OIDC trusted
publishing (same flow as the n8n nodes).
