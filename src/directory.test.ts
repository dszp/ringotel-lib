import { describe, it, expect } from 'vitest';
import { RingotelReadClient } from './readClient.js';
import { buildOrgBranchIndex, findByAddress, findByHost, orgSettings, type OrgBranchEntry } from './directory.js';
import { mockRpcFetch } from './testkit.js';

const ORGS = [
  { id: 'O1', domain: 'demo', name: 'Demo Co' },
  { id: 'O2', domain: 'acmevoice', name: 'Acme Voice' },
];
const BRANCHES: Record<string, any[]> = {
  O1: [{ id: 'B1', name: 'Acme Voice', address: 'demo', provision: { proxy: { paddr: 'sbc.example.net' } } }],
  O2: [
    { id: 'B2', name: 'Acme Voice', address: 'acme42', provision: { proxy: { paddr: 'sbc-iad.example.net' } } },
    { id: 'B3', name: 'Other Provider', address: 'reg.example.org:5060', provision: { proxy: { paddr: 'x.edge.example.org' } } },
  ],
};

function client(): RingotelReadClient {
  const { fetchImpl } = mockRpcFetch({
    handler: (c) => (c.method === 'getOrganizations' ? ORGS : c.method === 'getBranches' ? BRANCHES[String(c.params.orgid)] ?? [] : []),
  });
  return new RingotelReadClient({ token: 'k', fetchImpl });
}

describe('buildOrgBranchIndex', () => {
  it('flattens every org+branch into serializable entries (address = NS domain, host = proxy.paddr)', async () => {
    const index = await buildOrgBranchIndex(client());
    expect(index).toHaveLength(3);
    const b2 = index.find((e) => e.branchid === 'B2')!;
    expect(b2).toEqual<OrgBranchEntry>({
      orgid: 'O2',
      orgDomain: 'acmevoice',
      orgName: 'Acme Voice',
      branchid: 'B2',
      branchName: 'Acme Voice',
      address: 'acme42',
      host: 'sbc-iad.example.net',
    });
  });
});

describe('findByAddress (local, exact case-insensitive)', () => {
  const index: OrgBranchEntry[] = [
    { orgid: 'O2', branchid: 'B2', address: 'acme42', host: 'sbc-iad.example.net' },
    { orgid: 'O2', branchid: 'B3', address: 'reg.example.org:5060', host: 'x.edge.example.org' },
  ];
  it('resolves a NS domain to its org+branch entry without any API call', () => {
    expect(findByAddress(index, 'acme42')?.orgid).toBe('O2');
    expect(findByAddress(index, 'ACME42')?.branchid).toBe('B2'); // case-insensitive
    expect(findByAddress(index, 'nope')).toBeUndefined();
  });
  it('ignores a :port on either side (e.g. addresses stored as domain:5061)', () => {
    const withPort: OrgBranchEntry[] = [{ orgid: 'O3', branchid: 'B9', address: 'svc.12345.service:5061' }];
    expect(findByAddress(withPort, 'svc.12345.service')?.branchid).toBe('B9');
    expect(findByAddress(index, 'acme42:5060')?.branchid).toBe('B2');
  });
});

describe('findByHost (local, glob/RegExp)', () => {
  const index: OrgBranchEntry[] = [
    { orgid: 'O1', branchid: 'B1', host: 'sbc.example.net' },
    { orgid: 'O2', branchid: 'B2', host: 'sbc-iad.example.net' },
    { orgid: 'O2', branchid: 'B3', host: 'x.edge.example.org' },
  ];
  it('returns all entries whose host matches', () => {
    expect(findByHost(index, '*.example.net').map((e) => e.branchid)).toEqual(['B1', 'B2']);
    expect(findByHost(index, '*edge*').map((e) => e.branchid)).toEqual(['B3']);
    expect(findByHost(index, /edge/).map((e) => e.branchid)).toEqual(['B3']);
  });
});

describe('buildOrgBranchIndex', () => {
  it('carries the raw params.sso onto each entry', async () => {
    const client = {
      getOrganizations: async () => [
        { id: 'O1', domain: 'acmevoice', params: { sso: '123/netsapiens_sso' } },
        { id: 'O2', domain: 'noSsoOrg', params: { lang: 'en' } },
        { id: 'O3', domain: 'emptySso', params: { sso: '' } },
      ],
      getBranches: async (orgid: string) => [{ id: 'B1', orgid, address: `addr-${orgid}` }],
    } as any;

    const index = await buildOrgBranchIndex(client);
    expect(index.find((e) => e.orgid === 'O1')?.ssoService).toBe('123/netsapiens_sso');
    expect(index.find((e) => e.orgid === 'O2')?.ssoService).toBeUndefined();
    expect(index.find((e) => e.orgid === 'O3')?.ssoService).toBeUndefined();
  });
});

describe('orgSettings (the one derivation, shared with a consumer’s fresher per-org read)', () => {
  it('reads params.sso → ssoService, ignoring empty and non-string values', () => {
    expect(orgSettings({ params: { sso: '123/netsapiens_sso' } }).ssoService).toBe('123/netsapiens_sso');
    expect(orgSettings({ params: { sso: '' } }).ssoService).toBeUndefined();
    expect(orgSettings({ params: { sso: 123 } }).ssoService).toBeUndefined();
    expect(orgSettings({ params: {} }).ssoService).toBeUndefined();
  });

  it('reads params.hidePassInEmail only when it is a real boolean — false is a VALUE, not absence', () => {
    expect(orgSettings({ params: { hidePassInEmail: true } }).hidePassInEmail).toBe(true);
    expect(orgSettings({ params: { hidePassInEmail: false } }).hidePassInEmail).toBe(false);
    expect(orgSettings({ params: { hidePassInEmail: 'true' } }).hidePassInEmail).toBeUndefined();
    expect(orgSettings({ params: {} }).hidePassInEmail).toBeUndefined();
  });

  it('OMITS absent keys rather than emitting undefined, so the result overlays cleanly', () => {
    expect(Object.keys(orgSettings({ params: {} }))).toEqual([]);
    expect(Object.keys(orgSettings({}))).toEqual([]);
    expect(Object.keys(orgSettings(null))).toEqual([]);
    expect(Object.keys(orgSettings(undefined))).toEqual([]);
    // The overlay contract: spreading a settings object with no `ssoService` must not punch a hole in an
    // entry that HAS one -- a consumer clears the two fields by replacing them wholesale, deliberately.
    expect({ ssoService: 'x', ...orgSettings({ params: {} }) }.ssoService).toBe('x');
  });

  it('agrees EXACTLY with what buildOrgBranchIndex projects — the drift this helper exists to prevent', async () => {
    const org = { id: 'O1', domain: 'acmevoice', params: { sso: '123/netsapiens_sso', hidePassInEmail: false } };
    const c = {
      getOrganizations: async () => [org],
      getBranches: async (orgid: string) => [{ id: 'B1', orgid, address: 'acme42' }],
    } as any;
    const entry = (await buildOrgBranchIndex(c))[0]!;
    const fresh = orgSettings(org);
    expect(fresh.ssoService).toBe(entry.ssoService);
    expect(fresh.hidePassInEmail).toBe(entry.hidePassInEmail);
  });
});
