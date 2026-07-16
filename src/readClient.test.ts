import { describe, it, expect } from 'vitest';
import { RingotelReadClient } from './readClient.js';
import { mockRpcFetch, type RpcCall } from './testkit.js';

/** Build a read client whose calls are recorded; every method returns `[]`/`{}` by default. */
function make(injectOrgId = false): { client: RingotelReadClient; calls: RpcCall[] } {
  const { fetchImpl, calls } = mockRpcFetch({
    handler: (c) => (c.method === 'getUser' || c.method === 'getOrganization' || c.method === 'getAccount' ? {} : []),
  });
  const client = new RingotelReadClient({ token: 'k', fetchImpl, injectOrgId });
  return { client, calls };
}

describe('RingotelReadClient — RPC method + param shaping', () => {
  it('sends the right method and params for org/branch reads', async () => {
    const { client, calls } = make();
    await client.getOrganizations();
    await client.getOrganization('ORG1');
    await client.getBranches('ORG1');
    await client.getBranch('BR1', 'ORG1');
    await client.getBranchOptions('BR1', 'ORG1');

    expect(calls.map((c) => [c.method, c.params])).toEqual([
      ['getOrganizations', {}],
      ['getOrganization', { id: 'ORG1' }],
      ['getBranches', { orgid: 'ORG1' }],
      ['getBranch', { id: 'BR1', orgid: 'ORG1' }],
      ['getBranchOptions', { id: 'BR1', orgid: 'ORG1' }],
    ]);
  });

  it('getTemplates is account-level (params {})', async () => {
    const { client, calls } = make();
    await client.getTemplates();
    expect(calls[0]).toMatchObject({ method: 'getTemplates', params: {} });
  });

  it('shapes the three non-{orgid} user reads correctly', async () => {
    const { client, calls } = make();
    await client.getUserLogs('USER1', 'acme.55501.service');
    await client.getPhoneBookURL('ORG1', 'USER1', 'Yealink');
    await client.getSIPCredentials('ORG1', 'USER1', 'sip', true);

    expect(calls[0]).toMatchObject({ method: 'getUserLogs', params: { userid: 'USER1', domain: 'acme.55501.service' } });
    expect(calls[1]).toMatchObject({ method: 'getPhoneBookURL', params: { orgid: 'ORG1', userid: 'USER1', format: 'Yealink' } });
    expect(calls[2]).toMatchObject({ method: 'getSIPCredentials', params: { orgid: 'ORG1', userid: 'USER1', protocol: 'sip', termpass: true } });
  });

  it('omits optional params when not supplied', async () => {
    const { client, calls } = make();
    await client.getUsers('ORG1');
    await client.getSIPCredentials('ORG1', 'USER1');
    await client.getUserRegistrationsHistory('ORG1', 'USER1');

    expect(calls[0]!.params).toEqual({ orgid: 'ORG1' });
    expect(calls[1]!.params).toEqual({ orgid: 'ORG1', userid: 'USER1' });
    expect(calls[2]!.params).toEqual({ orgid: 'ORG1', userid: 'USER1' });
  });

  it('passes branchid to getUsers when supplied', async () => {
    const { client, calls } = make();
    await client.getUsers('ORG1', 'BR1');
    expect(calls[0]!.params).toEqual({ orgid: 'ORG1', branchid: 'BR1' });
  });

  it('sends account/meta reads with the right params', async () => {
    const { client, calls } = make();
    await client.getAccount();
    await client.getAccountUsers();
    await client.getAccountStatistics(1000, 2000);
    await client.getRegions();
    await client.getPackages();
    await client.getServices('ORG1');
    await client.getSMSTrunks('ORG1');
    await client.getAgents('ORG1');
    await client.getContacts('ORG1');
    await client.getBlockedContacts('ORG1');

    expect(calls.map((c) => [c.method, c.params])).toEqual([
      ['getAccount', {}],
      ['getAccountUsers', {}],
      ['getAccountStatistics', { begin: 1000, end: 2000 }],
      ['getRegions', {}],
      ['getPackages', {}],
      ['getServices', { orgid: 'ORG1' }],
      ['getSMSTrunks', { orgid: 'ORG1' }],
      ['getAgents', { orgid: 'ORG1' }],
      ['getContacts', { orgid: 'ORG1' }],
      ['getBlockedContacts', { orgid: 'ORG1' }],
    ]);
  });
});

describe('RingotelReadClient — orgid injection (opt-in)', () => {
  it('does NOT inject orgid by default', async () => {
    const { fetchImpl } = mockRpcFetch({ results: { getUsers: [{ id: 'U1' }], getUser: { id: 'U1' } } });
    const client = new RingotelReadClient({ token: 'k', fetchImpl });
    expect(await client.getUsers('ORG1')).toEqual([{ id: 'U1' }]);
    expect(await client.getUser('U1', 'ORG1')).toEqual({ id: 'U1' });
  });

  it('injects orgid onto getUsers/getUser results when enabled', async () => {
    const { fetchImpl } = mockRpcFetch({ results: { getUsers: [{ id: 'U1' }, { id: 'U2' }], getUser: { id: 'U1' } } });
    const client = new RingotelReadClient({ token: 'k', fetchImpl, injectOrgId: true });
    expect(await client.getUsers('ORG1')).toEqual([
      { id: 'U1', orgid: 'ORG1' },
      { id: 'U2', orgid: 'ORG1' },
    ]);
    expect(await client.getUser('U1', 'ORG1')).toEqual({ id: 'U1', orgid: 'ORG1' });
  });
});
