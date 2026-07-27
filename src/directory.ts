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

/**
 * The org-level settings projected onto every row — the parts of an organization that a consumer may
 * legitimately want to refresh on a SHORTER cadence than the index itself.
 *
 * Split out from `OrgBranchEntry` because these are the *volatile* fields. Which org serves a domain
 * changes approximately never and costs a fleet-wide `getOrganizations` + per-org `getBranches` to
 * discover; these two change whenever an operator edits the org in the Ringotel admin and cost one
 * `getOrganization(orgid)` to re-read. A consumer that caches the index for an hour can therefore
 * overlay a fresher copy of just these — see `orgSettings`.
 */
export interface OrgSettings {
  /** Raw `org.params.sso` — `"<serviceDefinitionId>/<serviceName>"` when an SSO service is bound to
   *  the org, absent otherwise. Reported verbatim: whether a given binding "counts" is the consumer's
   *  policy (it may point at a third-party IdP), and encoding one deployment's service name here
   *  would bind this library to that deployment. */
  ssoService?: string;
  /** Raw `org.params.hidePassInEmail`. `true` when the organization's credentials email withholds the
   *  password behind a one-time reveal link, `false` when the password is in the message itself, absent
   *  when the organization does not report it. Reported verbatim so a consumer can word its own
   *  instructions accurately instead of hedging across both cases. */
  hidePassInEmail?: boolean;
}

/**
 * Derive the volatile org settings from one organization record. **The single derivation** — used by
 * `buildOrgBranchIndex`'s projection below AND by any consumer that re-reads a single org via
 * `getOrganization(orgid)` to refresh these on a shorter cadence than the whole index.
 *
 * It exists precisely so those two cannot drift. A consumer that hand-rolled the `params.sso` →
 * `ssoService` mapping for its fresher read would, the day this derivation changed, produce an overlay
 * that silently contradicts the cached index — and the contradiction would surface as "some users are
 * shown the wrong way to sign in", with no error anywhere.
 *
 * Absence is meaningful and is preserved: a key is omitted, never emitted as `undefined`, so
 * `{...orgSettings(org)}` spreads cleanly over an existing entry without punching holes in it, and so a
 * consumer overlaying the result replaces "SSO is bound" with "SSO is not bound" by the key going away.
 */
export function orgSettings(org: { params?: Rec } | null | undefined): OrgSettings {
  const params = org?.params;
  return {
    ...(typeof params?.sso === 'string' && params.sso.length > 0 ? { ssoService: String(params.sso) } : {}),
    ...(typeof params?.hidePassInEmail === 'boolean' ? { hidePassInEmail: params.hidePassInEmail } : {}),
  };
}

/** One flattened (org, branch) row — serializable, safe to cache as JSON. */
export interface OrgBranchEntry extends OrgSettings {
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
      // ONE derivation, shared with any consumer that re-reads a single org to refresh these on a
      // shorter cadence. Never inline this — see `orgSettings`.
      ...orgSettings(org),
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
 * differs from the Ringotel org domain (e.g. address "acme42" → org "acmevoice"), so this is the
 * reliable NS→(orgid, branchid) resolver.
 */
export function findByAddress(index: OrgBranchEntry[], address: string): OrgBranchEntry | undefined {
  const target = normAddress(address);
  return index.find((e) => typeof e.address === 'string' && normAddress(e.address) === target);
}

/** Local, network-free: all entries whose connect host matches a glob (`*.example.net`) or RegExp. */
export function findByHost(index: OrgBranchEntry[], pattern: string | RegExp): OrgBranchEntry[] {
  return index.filter((e) => matchHost(e.host, pattern));
}
