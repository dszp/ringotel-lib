import { describe, it, expect } from 'vitest';
import { assessUserHealth, worstSeverity, HEALTH_SEVERITY } from './health.js';
import type { User } from './model.js';

const u = (p: Partial<User>): User =>
  ({ id: 'x', branchid: 'BR1', extension: '100', created: 1000, stime: 1000, ...p }) as User;
const opts = { ext: '100', suffix: 'r' };

describe('assessUserHealth', () => {
  it('healthy active user → no flags, ok', () => {
    const r = assessUserHealth(
      u({ status: 1, username: '100r', authname: '100r', trunkid: 'T1', trunkstate: 1, stime: 5000 }),
      opts,
    );
    expect(r.flags).toEqual([]);
    expect(r.severity).toBe('ok');
  });

  it('brick — active with no authname', () => {
    // Defaults created:1000, stime:1000 → also legitimately never-connected; assert the real full set.
    const r = assessUserHealth(u({ status: 1, trunkid: 'T1', authname: undefined }), opts);
    expect(r.flags).toEqual(['brick', 'never-connected']);
    expect(r.severity).toBe('broken');
  });

  it('brick takes precedence over authname-drift (no double-report)', () => {
    const r = assessUserHealth(u({ status: 1, trunkid: 'T1', authname: '' }), opts);
    expect(r.flags).toEqual(['brick', 'never-connected']);
  });

  it('authname-drift — authname present but not <ext><suffix>', () => {
    const r = assessUserHealth(u({ status: 1, authname: '100x', trunkid: 'T1', trunkstate: 1, stime: 5000 }), opts);
    expect(r.flags).toEqual(['authname-drift']);
    expect(r.severity).toBe('broken');
  });

  it('no-trunk — active but never linked to the PBX', () => {
    const r = assessUserHealth(u({ status: 1, authname: '100r', trunkstate: 1, stime: 5000 }), opts);
    expect(r.flags).toEqual(['no-trunk']);
  });

  it('no-trunk does not also report stale-registration (Finding 1 regression)', () => {
    // A record with no trunk was never registered, so nothing can be "stale" about its registration —
    // even when it has connected before (stime > created) and trunkstate reads 0.
    const r = assessUserHealth(
      u({ status: 1, authname: '100r', trunkid: undefined, created: 1000, stime: 5000, trunkstate: 0 }),
      opts,
    );
    expect(r.flags).toEqual(['no-trunk']);
  });

  it('never-connected — stime equals created', () => {
    const r = assessUserHealth(
      u({ status: 1, authname: '100r', trunkid: 'T1', created: 1000, stime: 1000 }),
      opts,
    );
    expect(r.flags).toEqual(['never-connected']);
    expect(r.severity).toBe('info');
  });

  it('never-connected is not reported for an inactive record', () => {
    const r = assessUserHealth(u({ status: -1, authname: '100r', created: 1000, stime: 1000 }), opts);
    expect(r.flags).toEqual(['tombstone']);
  });

  it('tombstone — status -1', () => {
    const r = assessUserHealth(u({ status: -1, authname: '100r' }), opts);
    expect(r.flags).toEqual(['tombstone']);
    expect(r.severity).toBe('info');
  });

  it('stale-registration — connected before but trunk not live', () => {
    const r = assessUserHealth(
      u({ status: 1, authname: '100r', trunkid: 'T1', trunkstate: 0, created: 1000, stime: 5000 }),
      opts,
    );
    expect(r.flags).toEqual(['stale-registration']);
    expect(r.severity).toBe('warn');
  });

  it('duplicate — siblingCount above 1', () => {
    const r = assessUserHealth(
      u({ status: 1, authname: '100r', trunkid: 'T1', trunkstate: 1, stime: 5000 }),
      { ...opts, siblingCount: 2 },
    );
    expect(r.flags).toEqual(['duplicate']);
    expect(r.severity).toBe('broken');
  });

  it('missing stime/created never fabricates never-connected', () => {
    const r = assessUserHealth(
      u({ status: 1, authname: '100r', trunkid: 'T1', trunkstate: 1, created: undefined, stime: undefined }),
      opts,
    );
    expect(r.flags).toEqual([]);
  });

  it('no-ns-device is in the vocabulary but never emitted here', () => {
    expect(HEALTH_SEVERITY['no-ns-device']).toBe('broken');
    const all = [
      assessUserHealth(u({ status: 1 }), opts),
      assessUserHealth(u({ status: -1 }), opts),
      assessUserHealth(u({ status: 1, authname: '100r', trunkid: 'T1', trunkstate: 0, stime: 5000 }), opts),
    ];
    for (const r of all) expect(r.flags).not.toContain('no-ns-device');
  });
});

describe('worstSeverity', () => {
  it('empty → ok', () => expect(worstSeverity([])).toBe('ok'));
  it('picks the worst', () => expect(worstSeverity(['never-connected', 'brick'])).toBe('broken'));
  it('warn beats info', () => expect(worstSeverity(['tombstone', 'stale-registration'])).toBe('warn'));
});
