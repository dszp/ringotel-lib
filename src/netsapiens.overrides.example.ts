/**
 * EXAMPLE NetSapiens → Ringotel override table — FICTIONAL data, safe to publish.
 *
 * This is the `.dev.vars.example` of the mapping engine: a template showing the shape of a real
 * override set. Copy it to a gitignored `netsapiens.overrides.local.ts` (excluded from the package),
 * or — preferred — build your real `MappingConfig` in your own consumer and pass it
 * to `resolveOrgKey`/`resolveOrg`. Do NOT put real customer domain→org mappings in committed source.
 *
 * The defaults already auto-map pattern-following NS domains (first label), so overrides are only
 * needed for the exceptions: name changes, full-domain-as-key, or a differing middle `#####`.
 */

import type { MappingConfig, MappingRule } from './mapping.js';
import { NETSAPIENS_DEFAULT_TRANSFORM } from './mapping.js';

export const EXAMPLE_NETSAPIENS_OVERRIDES: MappingRule[] = [
  // Name change: the NS first label differs from the Ringotel org key.
  { match: 'acme42', to: 'acmevoice' },
  // The full NS domain (with suffix) IS the Ringotel key for this tenant.
  { match: 'legacy.99999.service', to: 'legacy.99999.service' },
  // Pattern rule: any *.internal.service maps to its uppercased first label.
  { match: /\.internal\.service$/, to: (src) => (src.split('.')[0] ?? src).toUpperCase() },
];

export const EXAMPLE_NETSAPIENS_MAPPING: MappingConfig = {
  rules: EXAMPLE_NETSAPIENS_OVERRIDES,
  defaultTransform: NETSAPIENS_DEFAULT_TRANSFORM,
};
