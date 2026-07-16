/**
 * Org+branch directory — turn the expensive "which org/branch matches this NS domain?" dig into a
 * cheap local lookup.
 *
 * `buildOrgBranchIndex` does the one-time expensive gather (getOrganizations + getBranches per org,
 * bounded concurrency) and returns a flat, serializable index. The CONSUMER caches that index (KV, D1,
 * memory — caching policy lives in the consumer, per this lib's charter) and refreshes it on its own
 * cadence. `findByAddress` / `findByHost` are then pure, network-free lookups over the cached index.
 *
 * `address` on a NetSapiens-connected branch IS the NetSapiens domain — the FULL one, matched
 * EXACTLY (modulo a trailing `:port` and case). Pass `findByAddress` the whole domain exactly as
 * NetSapiens has it; never a transformed or first-label form. That makes it a definitive
 * NS→(orgid, branchid) resolution with zero API calls.
 *
 * This — not the org name — is the authoritative binding. A Ringotel org's name may match the NS
 * domain, may drop its suffix, or may be unrelated; nothing here should depend on it. (`mapping.ts`
 * is for resolving an org from some OTHER source key, when no branch address is available.)
 *
 * A NS domain may be bare ("acme") or carry a territory suffix ("acme.12345.service"), and both
 * shapes coexist in one scope — permanently, since NS domains can't be renamed and keep their
 * original name (and suffix) when they move between scopes. Exact matching handles both without
 * caring which shape it is, which is the point of never parsing the suffix.
 */

import type { RingotelReadClient } from './readClient.js';
import type { Rec } from './model.js';
import { branchHost, matchHost } from './branch.js';

/** One flattened (org, branch) row — serializable, safe to cache as JSON. */
export interface OrgBranchEntry {
  orgid: string;
  orgDomain?: string;
  orgName?: string;
  branchid: string;
  branchName?: string;
  /** The branch `address` — on NetSapiens branches this IS the NS domain. */
  address?: string;
  /** The SIP connect host (`provision.proxy.paddr`). */
  host?: string;
}

export interface BuildIndexOptions {
  /** Max concurrent getBranches calls. Default 5 (mind Workers' subrequest cap on large fleets). */
  concurrency?: number;
}

/** Map with bounded concurrency — keeps the per-org getBranches fan-out from hammering the API. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx]!);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * Build the full org+branch index — the expensive dig (getOrganizations + getBranches per org). Run
 * this occasionally and cache the result in the consumer; do NOT call it per request.
 */
export async function buildOrgBranchIndex(client: RingotelReadClient, opts: BuildIndexOptions = {}): Promise<OrgBranchEntry[]> {
  const orgs = await client.getOrganizations();
  const perOrg = await mapLimit(orgs, opts.concurrency ?? 5, async (org: Rec) => {
    const branches = await client.getBranches(String(org.id));
    return branches.map((b: Rec): OrgBranchEntry => ({
      orgid: String(org.id),
      ...(org.domain != null ? { orgDomain: String(org.domain) } : {}),
      ...(org.name != null ? { orgName: String(org.name) } : {}),
      branchid: String(b.id),
      ...(b.name != null ? { branchName: String(b.name) } : {}),
      ...(b.address != null ? { address: String(b.address) } : {}),
      ...(branchHost(b) != null ? { host: branchHost(b)! } : {}),
    }));
  });
  return perOrg.flat();
}

/** Strip a trailing `:port` and lowercase, so "svc.12345.service:5061" matches "svc.12345.service". */
function normAddress(a: string): string {
  return a.replace(/:\d+$/, '').toLowerCase();
}

/**
 * Local, network-free: resolve a NS domain (or any branch address) to its entry — case-insensitive,
 * ignoring any `:port` on either side. `branch.address` is the AUTHORITATIVE NS domain and often
 * differs from the Ringotel org domain (e.g. address "acme42" → org "acmevoice", address
 * "midmichgarage" → org "midmichigangarage"), so this is the reliable NS→(orgid, branchid) resolver.
 */
export function findByAddress(index: OrgBranchEntry[], address: string): OrgBranchEntry | undefined {
  const target = normAddress(address);
  return index.find((e) => typeof e.address === 'string' && normAddress(e.address) === target);
}

/** Local, network-free: all entries whose connect host matches a glob (`*.example.net`) or RegExp. */
export function findByHost(index: OrgBranchEntry[], pattern: string | RegExp): OrgBranchEntry[] {
  return index.filter((e) => matchHost(e.host, pattern));
}
