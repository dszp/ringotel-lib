/**
 * Generic, config-driven mapping from an arbitrary SOURCE key (e.g. a NetSapiens domain) to a
 * Ringotel ORG key, plus a resolver from that key to the numeric `orgid` via a live org directory.
 *
 * The engine is source-system-neutral and safe to publish: nothing NetSapiens-specific is baked in
 * beyond `NETSAPIENS_DEFAULT_TRANSFORM` (a plain first-label helper) and a *fictional* example config
 * in `netsapiens.overrides.example.ts`. REAL override tables (customer domains) must NOT live in
 * committed/published source — supply them from the consumer via `MappingConfig`, or from a gitignored
 * `netsapiens.overrides.local.ts` excluded from the package.
 *
 * How it maps:
 *   - `rules` are overrides, evaluated in order, FIRST MATCH WINS. A rule matches by exact string,
 *     RegExp, or predicate; its target is a fixed string or a function of the source.
 *   - if no rule matches, `defaultTransform` runs (default: first label — `demo.12345.service` →
 *     `demo`), so new pattern-following orgs map automatically with no config.
 */

import type { Rec } from './model.js';

export interface MappingRule {
  /** Match the source key by exact string, RegExp, or predicate. */
  match: string | RegExp | ((src: string) => boolean);
  /** Target Ringotel org key: a fixed string or a function of the source. */
  to: string | ((src: string) => string);
}

export interface MappingConfig {
  /** Overrides, evaluated in order (first match wins), before `defaultTransform`. */
  rules?: MappingRule[];
  /** Fallback when no rule matches. Default: `NETSAPIENS_DEFAULT_TRANSFORM` (first label). */
  defaultTransform?: (src: string) => string;
}

/** Default transform for NetSapiens domains: take the first label. `demo.12345.service` → `demo`. */
export const NETSAPIENS_DEFAULT_TRANSFORM = (domain: string): string => domain.split('.')[0] ?? domain;

function ruleMatches(rule: MappingRule, src: string): boolean {
  if (typeof rule.match === 'string') return src === rule.match;
  if (rule.match instanceof RegExp) return rule.match.test(src);
  return rule.match(src);
}

/** Map a source key to a Ringotel org key using the config (overrides first, then defaultTransform). */
export function resolveOrgKey(source: string, cfg: MappingConfig = {}): string {
  for (const rule of cfg.rules ?? []) {
    if (ruleMatches(rule, source)) return typeof rule.to === 'function' ? rule.to(source) : rule.to;
  }
  return (cfg.defaultTransform ?? NETSAPIENS_DEFAULT_TRANSFORM)(source);
}

export interface ResolveOrgIdOptions {
  /**
   * Which org field to match `orgKey` against. `auto` (default) tries domain, then name, then id.
   * domain/name compares are case-insensitive; id is exact.
   */
  by?: 'domain' | 'name' | 'id' | 'auto';
}

function eqCI(a: unknown, b: string): boolean {
  return typeof a === 'string' && a.toLowerCase() === b.toLowerCase();
}

/** Find the org whose domain/name/id matches `orgKey` in a `getOrganizations()` directory. */
export function findOrg(orgKey: string, orgs: Rec[], opts: ResolveOrgIdOptions = {}): Rec | undefined {
  const by = opts.by ?? 'auto';
  if (by === 'id') return orgs.find((o) => String(o.id) === orgKey);
  if (by === 'domain') return orgs.find((o) => eqCI(o.domain, orgKey));
  if (by === 'name') return orgs.find((o) => eqCI(o.name, orgKey));
  // auto: domain → name → id
  return orgs.find((o) => eqCI(o.domain, orgKey)) ?? orgs.find((o) => eqCI(o.name, orgKey)) ?? orgs.find((o) => String(o.id) === orgKey);
}

/** Resolve an org key to its numeric `orgid` via the org directory, or undefined if not found. */
export function resolveOrgId(orgKey: string, orgs: Rec[], opts: ResolveOrgIdOptions = {}): string | undefined {
  const org = findOrg(orgKey, orgs, opts);
  return org ? String(org.id) : undefined;
}

/** Convenience: map a source key through the config, then find the matching org object. */
export function resolveOrg(source: string, orgs: Rec[], cfg: MappingConfig = {}, opts: ResolveOrgIdOptions = {}): Rec | undefined {
  return findOrg(resolveOrgKey(source, cfg), orgs, opts);
}
