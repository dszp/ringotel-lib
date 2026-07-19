import { describe, it, expect } from 'vitest';
import { resolveCanonicalUser } from './canonical.js';
import type { User } from './model.js';

const u = (p: Partial<User>): User => ({ id: p.id ?? 'x', branchid: 'BR1', extension: '100', ...p } as User);
const opts = { ext: '100', branchid: 'BR1', suffix: 'r' };

describe('resolveCanonicalUser', () => {
  it('none — no record at the extension', () => {
    const r = resolveCanonicalUser([u({ extension: '101' })], opts);
    expect(r.verdict).toBe('none');
    expect(r.user).toBeUndefined();
    expect(r.matches).toHaveLength(0);
  });

  it('active — exactly one record, status 1', () => {
    const rec = u({ id: 'A', status: 1, username: '100r', authname: '100r' });
    const r = resolveCanonicalUser([rec], opts);
    expect(r.verdict).toBe('active');
    expect(r.user?.id).toBe('A');
  });

  it('inactive-exists — exactly one record, status not 1', () => {
    const r = resolveCanonicalUser([u({ id: 'A', status: -1, authname: '100r' })], opts);
    expect(r.verdict).toBe('inactive-exists');
    expect(r.user?.id).toBe('A');
  });

  it('ambiguous — two records; canonical is the SIP-identity holder', () => {
    const active = u({ id: 'A', status: 1, username: '100r', authname: '100r', created: 2 });
    const phantom = u({ id: 'P', status: -1, created: 1 });
    const r = resolveCanonicalUser([phantom, active], opts);
    expect(r.verdict).toBe('ambiguous');
    expect(r.user?.id).toBe('A');
    expect(r.matches).toHaveLength(2);
  });

  it('ambiguous — no SIP-identity holder falls back to newest', () => {
    const older = u({ id: 'O', created: 1 });
    const newer = u({ id: 'N', created: 5 });
    const r = resolveCanonicalUser([older, newer], opts);
    expect(r.verdict).toBe('ambiguous');
    expect(r.user?.id).toBe('N');
  });

  it('ambiguous — no SIP-identity holder prefers the ACTIVE record over a newer inactive one', () => {
    // In-use active record created earlier vs. a newer but inactive/tombstone record: the newest-wins
    // fallback used to pick the inactive one, and a healer following `user` would delete the working
    // active user. The active record must win regardless of creation order.
    const active = u({ id: 'A', status: 1, created: 1 });
    const newerInactive = u({ id: 'N', status: -1, created: 5 });
    const r = resolveCanonicalUser([active, newerInactive], opts);
    expect(r.verdict).toBe('ambiguous');
    expect(r.user?.id).toBe('A');
  });

  it('ambiguous — two records share SIP identity → unpickable (user undefined)', () => {
    const a = u({ id: 'A', username: '100r', created: 1 });
    const b = u({ id: 'B', authname: '100r', created: 2 });
    const r = resolveCanonicalUser([a, b], opts);
    expect(r.verdict).toBe('ambiguous');
    expect(r.user).toBeUndefined();
  });

  it('ignores records in a different branch', () => {
    const other = u({ id: 'X', branchid: 'BR2', status: 1, authname: '100r' });
    const r = resolveCanonicalUser([other], opts);
    expect(r.verdict).toBe('none');
  });
});
