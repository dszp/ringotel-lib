import { describe, it, expect } from 'vitest';
import { RingotelReadClient } from './readClient.js';
import { fetchOrgSnapshot, listOrganizations } from './snapshot.js';
import { mockRpcFetch, type MockRpcOptions } from './testkit.js';

const DEFAULTS: Record<string, unknown> = {
  getOrganization: { id: 'ORG1', domain: 'demo', name: 'Demo Co' },
  getBranches: [{ id: 'BR1', orgid: 'ORG1' }],
  getUsers: [{ id: 'U1' }, { id: 'U2' }],
  getContacts: [{ id: 'C1' }],
  getSMSTrunks: [{ id: 'T1' }],
  getOrganizations: [{ id: 'ORG1' }, { id: 'ORG2' }],
};

function client(extra: Partial<MockRpcOptions> = {}): { client: RingotelReadClient; calls: ReturnType<typeof mockRpcFetch>['calls'] } {
  const { fetchImpl, calls } = mockRpcFetch({ handler: (c) => DEFAULTS[c.method] ?? [], ...extra });
  return { client: new RingotelReadClient({ token: 'k', fetchImpl }), calls };
}

describe('fetchOrgSnapshot', () => {
  it('gathers org + branches + users + contacts + sms trunks', async () => {
    const { client: c } = client();
    const snap = await fetchOrgSnapshot(c, 'ORG1');

    expect(snap.meta.orgid).toBe('ORG1');
    expect(snap.organization).toMatchObject({ domain: 'demo' });
    expect(snap.branches).toHaveLength(1);
    expect(snap.users).toHaveLength(2);
    expect(snap.contacts).toHaveLength(1);
    expect(snap.smsTrunks).toHaveLength(1);
  });

  it('tolerates gaps: a soft (optional) read that errors becomes empty, no throw', async () => {
    const { client: c } = client({ errors: { getContacts: { message: 'not available' }, getSMSTrunks: { message: 'nope' } } });
    const snap = await fetchOrgSnapshot(c, 'ORG1');

    expect(snap.contacts).toEqual([]);
    expect(snap.smsTrunks).toEqual([]);
    expect(snap.users).toHaveLength(2); // essentials still gathered
  });

  it('propagates a hard failure on an essential read (users)', async () => {
    const { client: c } = client({ errors: { getUsers: { message: 'access denied' } } });
    await expect(fetchOrgSnapshot(c, 'ORG1')).rejects.toThrow(/access denied/);
  });

  it('shallow mode skips contacts + sms trunks', async () => {
    const { client: c, calls } = client();
    const snap = await fetchOrgSnapshot(c, 'ORG1', { shallow: true });

    expect(snap.branches).toHaveLength(1);
    expect(snap.users).toHaveLength(2);
    expect(snap.contacts).toEqual([]);
    expect(snap.smsTrunks).toEqual([]);
    expect(calls.map((x) => x.method)).not.toContain('getContacts');
    expect(calls.map((x) => x.method)).not.toContain('getSMSTrunks');
  });
});

describe('listOrganizations', () => {
  it('returns the org directory', async () => {
    const { client: c } = client();
    expect(await listOrganizations(c)).toEqual([{ id: 'ORG1' }, { id: 'ORG2' }]);
  });
});
