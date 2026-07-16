import { describe, it, expect, expectTypeOf } from 'vitest';
import { RingotelWriteClient } from './writeClient.js';
import { RingotelReadClient } from './readClient.js';
import { mockRpcFetch, type RpcCall } from './testkit.js';

/** Build a write client + recorded calls; every RPC returns `{}` by default. */
function make(): { client: RingotelWriteClient; calls: RpcCall[] } {
  const { fetchImpl, calls } = mockRpcFetch({ handler: () => ({}) });
  return { client: new RingotelWriteClient({ token: 'k', fetchImpl }), calls };
}

describe('RingotelWriteClient — user writes send the exact spec params', () => {
  it('createUser passes its input through', async () => {
    const { client, calls } = make();
    await client.createUser({ orgid: 'O', branchid: 'B', name: 'Jane', extension: '1001', email: 'j@x.co' });
    expect(calls[0]).toMatchObject({
      method: 'createUser',
      params: { orgid: 'O', branchid: 'B', name: 'Jane', extension: '1001', email: 'j@x.co' },
    });
  });

  it('createUsers wraps the bulk array', async () => {
    const { client, calls } = make();
    await client.createUsers('O', 'B', [{ name: 'A', extension: '1' }]);
    expect(calls[0]!.params).toEqual({ orgid: 'O', branchid: 'B', users: [{ name: 'A', extension: '1' }] });
  });

  it('updateUser maps userid → id and spreads changes', async () => {
    const { client, calls } = make();
    await client.updateUser('U1', 'O', { name: 'New', extension: '1002' });
    expect(calls[0]!.params).toEqual({ orgid: 'O', id: 'U1', name: 'New', extension: '1002' });
  });

  it('deleteUser / deactivateUser / resetUserPassword map userid → id', async () => {
    const { client, calls } = make();
    await client.deleteUser('U1', 'O');
    await client.deactivateUser('U1', 'O');
    await client.resetUserPassword('U1', 'O');
    expect(calls.map((c) => [c.method, c.params])).toEqual([
      ['deleteUser', { id: 'U1', orgid: 'O' }],
      ['deactivateUser', { id: 'U1', orgid: 'O' }],
      ['resetUserPassword', { id: 'U1', orgid: 'O' }],
    ]);
  });

  it('deleteUsers passes the id array as users', async () => {
    const { client, calls } = make();
    await client.deleteUsers('O', ['U1', 'U2']);
    expect(calls[0]!.params).toEqual({ orgid: 'O', users: ['U1', 'U2'] });
  });

  it('recoverDeletedUser passes identity fields (no id/orgid)', async () => {
    const { client, calls } = make();
    await client.recoverDeletedUser({ name: 'Jane', domain: 'demo', extension: '1001', email: 'j@x.co' });
    expect(calls[0]!.params).toEqual({ name: 'Jane', domain: 'demo', extension: '1001', email: 'j@x.co' });
  });

  it('attachUser / detachUser link unactivated (id) → activated (userid)', async () => {
    const { client, calls } = make();
    await client.attachUser('UNACT', 'ACT', 'O');
    await client.detachUser('UNACT', 'ACT', 'O');
    expect(calls[0]!.params).toEqual({ id: 'UNACT', userid: 'ACT', orgid: 'O' });
    expect(calls[1]!.params).toEqual({ id: 'UNACT', userid: 'ACT', orgid: 'O' });
  });

  it('setUserStatus / setUserState map userid → id (state uses dnd)', async () => {
    const { client, calls } = make();
    await client.setUserStatus('U1', 'O', 1);
    await client.setUserState('U1', 'O', true);
    expect(calls[0]!.params).toEqual({ id: 'U1', orgid: 'O', status: 1 });
    expect(calls[1]!.params).toEqual({ id: 'U1', orgid: 'O', dnd: true });
  });

  it('setUserPassword / resyncSIPDevice / deleteDevice use userid + termid', async () => {
    const { client, calls } = make();
    await client.setUserPassword('U1', 'O', 's3cret');
    await client.resyncSIPDevice('U1', 'O', 'TERM1');
    await client.deleteDevice('U1', 'O', 'TERM1');
    expect(calls[0]!.params).toEqual({ orgid: 'O', userid: 'U1', password: 's3cret' });
    expect(calls[1]!.params).toEqual({ orgid: 'O', userid: 'U1', termid: 'TERM1' });
    expect(calls[2]!.params).toEqual({ orgid: 'O', userid: 'U1', termid: 'TERM1' });
  });

  it('setUserSettings maps userid → id and spreads settings', async () => {
    const { client, calls } = make();
    await client.setUserSettings('U1', 'O', { voicemail: true, callwaiting: false });
    expect(calls[0]!.params).toEqual({ id: 'U1', orgid: 'O', voicemail: true, callwaiting: false });
  });
});

describe('RingotelWriteClient — org & branch writes', () => {
  it('org CRUD sends the right params', async () => {
    const { client, calls } = make();
    await client.createOrganization({ name: 'Acme', region: 'us', domain: 'acme' });
    await client.updateOrganization('O', { name: 'Acme 2', packageid: 3 });
    await client.deleteOrganization('O');
    await client.setOrganizationStatus('O', 1);
    expect(calls.map((c) => [c.method, c.params])).toEqual([
      ['createOrganization', { name: 'Acme', region: 'us', domain: 'acme' }],
      ['updateOrganization', { id: 'O', name: 'Acme 2', packageid: 3 }],
      ['deleteOrganization', { id: 'O' }],
      ['setOrganizationStatus', { id: 'O', status: 1 }],
    ]);
  });

  it('branch CRUD sends the right params', async () => {
    const { client, calls } = make();
    await client.createBranch({ orgid: 'O', name: 'HQ', address: 'pbx.x.co:5060', country: 'US', provision: { codecs: [] } });
    await client.updateBranch('B', 'O', { name: 'HQ2' });
    await client.deleteBranch('B', 'O');
    await client.setBranchStatus('B', 'O', 0);
    expect(calls.map((c) => [c.method, c.params])).toEqual([
      ['createBranch', { orgid: 'O', name: 'HQ', address: 'pbx.x.co:5060', country: 'US', provision: { codecs: [] } }],
      ['updateBranch', { orgid: 'O', id: 'B', name: 'HQ2' }],
      ['deleteBranch', { id: 'B', orgid: 'O' }],
      ['setBranchStatus', { id: 'B', orgid: 'O', status: 0 }],
    ]);
  });
});

describe('read/write surface separation (type-level; verified by `pnpm typecheck`)', () => {
  it('the read client exposes no mutating methods; the write client does', () => {
    expectTypeOf<RingotelReadClient>().not.toHaveProperty('createUser');
    expectTypeOf<RingotelReadClient>().not.toHaveProperty('attachUser');
    expectTypeOf<RingotelReadClient>().not.toHaveProperty('deleteUser');
    expectTypeOf<RingotelWriteClient>().toHaveProperty('createUser');
    expectTypeOf<RingotelWriteClient>().toHaveProperty('attachUser');
    expectTypeOf<RingotelWriteClient>().toHaveProperty('deleteOrganization');
  });
});
