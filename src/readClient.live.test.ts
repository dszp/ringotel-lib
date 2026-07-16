/**
 * Live read-only smoke test against the real Ringotel AdminAPI. Self-skips unless RINGOTEL_API_KEY is
 * set, so `pnpm test` stays green with no setup. Source the key from your secret manager at run
 * time — never commit it, and never hardcode it here:
 *
 *   RINGOTEL_API_KEY=... pnpm test
 *   # optional: RINGOTEL_BASE_URL for a non-default shell
 *
 * Read-only: it only calls get* methods. `process` is declared locally so this compiles under the
 * Node-free tsconfig (types: []); node provides it at run time.
 */
import { describe, it, expect } from 'vitest';
import { RingotelReadClient } from './readClient.js';
import { resolveOrg } from './mapping.js';

declare const process: { env: Record<string, string | undefined> } | undefined;
const KEY = typeof process !== 'undefined' ? process!.env.RINGOTEL_API_KEY : undefined;
const BASE = typeof process !== 'undefined' ? process!.env.RINGOTEL_BASE_URL : undefined;

describe.skipIf(!KEY)('live read smoke (real Ringotel API)', () => {
  const client = new RingotelReadClient({ token: KEY!, baseUrl: BASE, injectOrgId: true });

  it('lists organizations, then reads one org + its branches + users', async () => {
    const orgs = await client.getOrganizations();
    expect(Array.isArray(orgs)).toBe(true);
    expect(orgs.length).toBeGreaterThan(0);

    const first = orgs[0]!;
    const branches = await client.getBranches(first.id);
    const users = await client.getUsers(first.id);
    expect(Array.isArray(branches)).toBe(true);
    expect(Array.isArray(users)).toBe(true);

    // Mapping sanity: the org's own domain must resolve back to itself.
    if (first.domain) {
      expect(resolveOrg(first.domain, orgs)?.id).toBe(first.id);
    }
  });
});
