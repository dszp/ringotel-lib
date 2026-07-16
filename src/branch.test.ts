import { describe, it, expect } from 'vitest';
import { resolveBranch, resolveBranchOrThrow, branchHost, matchHost } from './branch.js';

// Shapes mirror real Ringotel branches: the connect host lives at provision.proxy.paddr;
// the top-level `address` is unreliable (on a NetSapiens-connected branch it is the NS
// domain, e.g. "acme42", not a hostname at all). Fixtures are fictional by policy.
const ACME = { id: 'ACME', name: 'Acme Voice', address: 'acme42', provision: { proxy: { paddr: 'sbc-iad.example.net' } } };
const OTHER = { id: 'GT', name: 'Other Provider', address: 'reg.example.org:5060', provision: { proxy: { paddr: 'acme42.edge.example.org' } } };

describe('branchHost', () => {
  it('reads provision.proxy.paddr first', () => {
    expect(branchHost(ACME)).toBe('sbc-iad.example.net');
    expect(branchHost(OTHER)).toBe('acme42.edge.example.org');
  });
  it('falls back to the address host only when it looks like a hostname', () => {
    expect(branchHost({ id: 'x', address: 'reg.example.org:5060' })).toBe('reg.example.org');
    expect(branchHost({ id: 'x', address: 'acme42' })).toBeUndefined(); // no dot → not a host
  });
  it('honors a custom hostOf', () => {
    expect(branchHost({ id: 'x', foo: 'h.example.com' }, (b) => b.foo)).toBe('h.example.com');
  });
});

describe('matchHost', () => {
  it('supports glob (* wildcard) and RegExp, case-insensitive', () => {
    expect(matchHost('sbc-iad.example.net', '*.example.net')).toBe(true);
    expect(matchHost('acme42.edge.example.org', '*.example.net')).toBe(false);
    expect(matchHost('SBC.EXAMPLE.NET', '*.example.net')).toBe(true);
    expect(matchHost('x.edge.example.org', /edge/)).toBe(true);
    expect(matchHost(undefined, '*.x.com')).toBe(false);
  });
});

describe('resolveBranch', () => {
  it('returns the sole branch for a single-branch org (default-to-one)', () => {
    expect(resolveBranch([ACME])).toBe(ACME);
  });
  it('returns undefined for no branches', () => {
    expect(resolveBranch([])).toBeUndefined();
  });
  it('returns undefined for a multi-branch org with no disambiguator', () => {
    expect(resolveBranch([ACME, OTHER])).toBeUndefined();
  });
  it('picks the branch whose connect host matches the pattern', () => {
    expect(resolveBranch([ACME, OTHER], { hostPattern: '*.example.net' })).toBe(ACME);
    expect(resolveBranch([ACME, OTHER], { hostPattern: /edge/ })).toBe(OTHER);
  });
  it('picks by name pattern and by explicit branchId', () => {
    expect(resolveBranch([ACME, OTHER], { namePattern: 'Other Provider' })).toBe(OTHER);
    expect(resolveBranch([ACME, OTHER], { branchId: 'ACME' })).toBe(ACME);
  });
  it('picks the NetSapiens branch by addressPattern (address = NS domain)', () => {
    expect(resolveBranch([ACME, OTHER], { addressPattern: 'acme42' })).toBe(ACME);
    expect(resolveBranch([ACME, OTHER], { addressPattern: 'reg.example.org:5060' })).toBe(OTHER);
  });
  it('uses defaultBranchId when multi-branch and no pattern given', () => {
    expect(resolveBranch([ACME, OTHER], { defaultBranchId: 'GT' })).toBe(OTHER);
  });
  it('falls back to defaultBranchId when a pattern is ambiguous or matches nothing', () => {
    const A = { id: 'A', provision: { proxy: { paddr: 'a.example.net' } } };
    const B = { id: 'B', provision: { proxy: { paddr: 'b.example.net' } } };
    expect(resolveBranch([A, B], { hostPattern: '*.example.net' })).toBeUndefined(); // 2 match → ambiguous
    expect(resolveBranch([A, B], { hostPattern: '*.example.net', defaultBranchId: 'B' })).toBe(B);
    expect(resolveBranch([ACME, OTHER], { hostPattern: '*.nomatch.com' })).toBeUndefined();
  });
});

describe('resolveBranchOrThrow', () => {
  it('returns the branch when resolvable', () => {
    expect(resolveBranchOrThrow([ACME, OTHER], { branchId: 'GT' })).toBe(OTHER);
  });
  it('throws a descriptive error listing candidates when ambiguous', () => {
    expect(() => resolveBranchOrThrow([ACME, OTHER])).toThrow(/Acme Voice.*Other Provider|Other Provider.*Acme Voice/);
  });
});
