import { describe, it, expect } from 'vitest';
import { buildOrgBranchIndex, findByAddress } from './directory.js';
import { NETSAPIENS_DEFAULT_TRANSFORM as T } from './mapping.js';

// A NetSapiens domain is an opaque identifier: it may be bare ("acme") or carry a territory suffix
// ("acme.12345.service"). Because NS domains can't be renamed and keep their original name when they
// move between scopes, ONE scope permanently mixes shapes -- bare domains AND several DIFFERENT
// territory suffixes. New domains take the current territory's suffix (that's what avoids
// collisions), so the suffix records where a domain was created, not who holds it. Never infer scope
// from it.
//
// branch.address is the authoritative NS->(orgid, branchid) binding and must match the FULL domain
// exactly, whatever shape it has. These are the regression guards for all of that.
const ORGS = [
  { id: 'O1', domain: 'acmevoice', name: 'Acme Voice' },   // org name deliberately unlike the domain
  { id: 'O2', domain: 'demo', name: 'Demo Co' },
  { id: 'O3', domain: 'oldco', name: 'Old Co' },
];
const BRANCHES: Record<string, any[]> = {
  O1: [{ id: 'B1', orgid: 'O1', address: 'legacyco' }],              // bare (ex-channel-partner)
  O2: [{ id: 'B2', orgid: 'O2', address: 'demo.12345.service' }],    // the reseller's own territory
  O3: [{ id: 'B3', orgid: 'O3', address: 'oldco.99999.service' }],   // acquired: a DIFFERENT territory
};
const client = { getOrganizations: async () => ORGS, getBranches: async (o: string) => BRANCHES[o] ?? [] } as any;

describe('NS domain shape: bare and suffixed both resolve', () => {
  it('branch.address matches the FULL NS domain exactly — bare or suffixed', async () => {
    const idx = await buildOrgBranchIndex(client);
    expect(findByAddress(idx, 'legacyco')?.orgid).toBe('O1');
    expect(findByAddress(idx, 'demo.12345.service')?.orgid).toBe('O2');
  });

  it('resolves across SEVERAL territory suffixes in one inventory (acquired domains keep theirs)', async () => {
    const idx = await buildOrgBranchIndex(client);
    expect(findByAddress(idx, 'oldco.99999.service')?.orgid).toBe('O3');
    // All three shapes coexist under one reseller: bare, own-territory, acquired-territory.
    expect([...new Set(idx.map((e) => String(e.address).split('.').slice(1).join('.')))].sort())
      .toEqual(['', '12345.service', '99999.service']);
  });

  it('matching is EXACT: a first-label form must NOT match a suffixed address', async () => {
    const idx = await buildOrgBranchIndex(client);
    // 'demo' is the ORG domain, not the branch address. Resolving by address must not accept it,
    // or a domain would bind to an org it merely resembles.
    expect(findByAddress(idx, 'demo')).toBeUndefined();
  });

  it('the org key is DERIVED (first label), so a bare domain passes through unchanged', () => {
    expect(T('demo.12345.service')).toBe('demo');
    expect(T('legacyco')).toBe('legacyco');
  });
});
