/**
 * Branch selection — pick which branch an action targets within a Ringotel org.
 *
 * Rule (per the integration's needs): a single-branch org defaults to its one branch; a multi-branch
 * org must be disambiguated — by explicit branch id, by a host pattern (prefer the branch whose SIP
 * connect host matches, e.g. `*.example.net` for the NetSapiens branch), by name, or by a
 * configured default. This mirrors the generic mapping engine in `mapping.ts`, but for branches.
 *
 * The connect host lives at `provision.proxy.paddr` (the top-level `address` is unreliable — on the
 * live NetSapiens branch it was literally "acme42"). Pure functions, no network: a consumer runs
 * `getBranches(orgid)` then `resolveBranch(branches, …)` and passes the result to the write call.
 */

import type { Rec } from './model.js';

/** A branch's SIP connect host. Default: `provision.proxy.paddr`, else the `address` host if it looks like one. */
export function branchHost(b: Rec, hostOf?: (b: Rec) => string | undefined): string | undefined {
  if (hostOf) return hostOf(b);
  const paddr = b?.provision?.proxy?.paddr;
  if (typeof paddr === 'string' && paddr) return paddr;
  const addr = b?.address;
  if (typeof addr === 'string' && addr.includes('.')) return addr.split(':')[0];
  return undefined;
}

function globToRegExp(glob: string): RegExp {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`, 'i');
}

/** Match a string against a glob (`*` wildcard) or RegExp, case-insensitive. */
export function matchHost(value: string | undefined, pattern: string | RegExp): boolean {
  if (!value) return false;
  const re = pattern instanceof RegExp ? pattern : globToRegExp(pattern);
  return re.test(value);
}

export interface ResolveBranchOptions {
  /** Explicit branch id — highest precedence. */
  branchId?: string;
  /** Prefer the branch whose connect host matches (glob like `*.example.net` or RegExp). */
  hostPattern?: string | RegExp;
  /** Prefer the branch whose name matches (glob or RegExp). */
  namePattern?: string | RegExp;
  /**
   * Prefer the branch whose `address` matches (glob or RegExp). On NetSapiens-connected branches the
   * `address` field IS the NetSapiens domain (e.g. "acme42"), so `addressPattern: nsDomain` pins the
   * NS branch precisely — even cleaner than a host glob.
   */
  addressPattern?: string | RegExp;
  /** Fallback branch id when a multi-branch org is otherwise ambiguous. */
  defaultBranchId?: string;
  /** Override how the connect host is extracted from a branch. */
  hostOf?: (b: Rec) => string | undefined;
}

function byId(branches: Rec[], id: string | undefined): Rec | undefined {
  return id ? branches.find((b) => String(b.id) === id) : undefined;
}

/**
 * Resolve the single branch an action should target, or `undefined` if it can't be decided.
 * Precedence: explicit `branchId` → `hostPattern`/`namePattern` (must match exactly one) → single
 * branch → `defaultBranchId`.
 */
export function resolveBranch(branches: Rec[], opts: ResolveBranchOptions = {}): Rec | undefined {
  if (!branches || branches.length === 0) return undefined;

  if (opts.branchId) return byId(branches, opts.branchId);

  const hasPattern = opts.hostPattern != null || opts.namePattern != null || opts.addressPattern != null;
  if (hasPattern) {
    const matches = branches.filter(
      (b) =>
        (opts.hostPattern == null || matchHost(branchHost(b, opts.hostOf), opts.hostPattern)) &&
        (opts.namePattern == null || matchHost(typeof b.name === 'string' ? b.name : undefined, opts.namePattern)) &&
        (opts.addressPattern == null || matchHost(typeof b.address === 'string' ? b.address : undefined, opts.addressPattern)),
    );
    if (matches.length === 1) return matches[0];
    return byId(branches, opts.defaultBranchId); // 0 or >1 matches → fall back to default (or undefined)
  }

  if (branches.length === 1) return branches[0];
  return byId(branches, opts.defaultBranchId);
}

/** Like `resolveBranch`, but throws a descriptive error (listing candidates) when it can't decide. */
export function resolveBranchOrThrow(branches: Rec[], opts: ResolveBranchOptions = {}): Rec {
  const branch = resolveBranch(branches, opts);
  if (branch) return branch;
  const list = (branches ?? [])
    .map((b) => {
      const host = branchHost(b, opts.hostOf);
      return `${b.name ?? '(unnamed)'} [${b.id}${host ? `, ${host}` : ''}]`;
    })
    .join('; ');
  throw new Error(
    `Could not resolve a single Ringotel branch from ${branches?.length ?? 0} candidate(s): ${list || '(none)'}. ` +
      `Specify branchId, hostPattern, namePattern, or defaultBranchId.`,
  );
}
