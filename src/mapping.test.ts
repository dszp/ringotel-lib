import { describe, it, expect } from 'vitest';
import {
  resolveOrgKey,
  resolveOrgId,
  resolveOrg,
  NETSAPIENS_DEFAULT_TRANSFORM,
  type MappingConfig,
} from './mapping.js';
import { EXAMPLE_NETSAPIENS_MAPPING } from './netsapiens.overrides.example.js';

const ORGS = [
  { id: '111', domain: 'demo', name: 'Demo Co' },
  { id: '222', domain: 'acmevoice', name: 'Acme Voice' },
  { id: '333', domain: 'acme', name: 'Acme Inc' },
];

describe('resolveOrgKey', () => {
  it('defaults to the first label (strip the .#####.service suffix)', () => {
    expect(resolveOrgKey('demo.12345.service')).toBe('demo');
    expect(NETSAPIENS_DEFAULT_TRANSFORM('demo.12345.service')).toBe('demo');
  });

  // A NetSapiens domain is an opaque string: it may be bare ("acme") or carry a territory suffix
  // ("acme.12345.service"), and both shapes coexist in one scope. Taking the first label handles
  // both; anything that parsed or required a suffix would silently break every bare domain. This is
  // the regression guard for that. (See domainshape.test.ts for the fuller picture.)
  it('leaves a bare, suffix-less domain unchanged', () => {
    expect(NETSAPIENS_DEFAULT_TRANSFORM('acme')).toBe('acme');
    expect(resolveOrgKey('testco')).toBe('testco');
    expect(resolveOrg('acme', [{ id: '1', domain: 'acme', name: 'Acme' }])).toMatchObject({ id: '1' });
  });

  it('applies a string override (exact match) before the default transform', () => {
    const cfg: MappingConfig = { rules: [{ match: 'acme42', to: 'acmevoice' }] };
    expect(resolveOrgKey('acme42', cfg)).toBe('acmevoice');
    // non-matching source falls through to the default transform
    expect(resolveOrgKey('other.55501.service', cfg)).toBe('other');
  });

  it('supports RegExp and function matchers, and function targets', () => {
    const cfg: MappingConfig = {
      rules: [
        { match: /\.internal\.service$/, to: (src) => src.split('.')[0].toUpperCase() },
        { match: (src) => src.startsWith('vip-'), to: 'vip' },
      ],
    };
    expect(resolveOrgKey('foo.internal.service', cfg)).toBe('FOO');
    expect(resolveOrgKey('vip-bar', cfg)).toBe('vip');
  });

  it('honors first-match-wins order', () => {
    const cfg: MappingConfig = {
      rules: [
        { match: 'a', to: 'first' },
        { match: /a/, to: 'second' },
      ],
    };
    expect(resolveOrgKey('a', cfg)).toBe('first');
  });

  it('respects a custom defaultTransform (e.g. identity / full domain)', () => {
    const cfg: MappingConfig = { defaultTransform: (s) => s };
    expect(resolveOrgKey('keep.the.whole.thing', cfg)).toBe('keep.the.whole.thing');
  });
});

describe('resolveOrgId', () => {
  it('resolves by domain, name, id, and auto', () => {
    expect(resolveOrgId('acmevoice', ORGS)).toBe('222'); // auto → domain
    expect(resolveOrgId('Acme Inc', ORGS, { by: 'name' })).toBe('333');
    expect(resolveOrgId('111', ORGS, { by: 'id' })).toBe('111');
    expect(resolveOrgId('Demo Co', ORGS)).toBe('111'); // auto falls through domain→name
  });

  it('is case-insensitive for domain/name and returns undefined when nothing matches', () => {
    expect(resolveOrgId('ACMEVOICE', ORGS)).toBe('222');
    expect(resolveOrgId('nope', ORGS)).toBeUndefined();
  });
});

describe('resolveOrg (convenience: source → mapped key → org)', () => {
  it('maps an NS domain through overrides to the Ringotel org', () => {
    const cfg: MappingConfig = { rules: [{ match: 'acme42', to: 'acmevoice' }] };
    expect(resolveOrg('acme42', ORGS, cfg)).toMatchObject({ id: '222', domain: 'acmevoice' });
    // default-transform path: demo.12345.service → demo → org 111
    expect(resolveOrg('demo.12345.service', ORGS)).toMatchObject({ id: '111' });
  });
});

describe('netsapiens.overrides.example', () => {
  it('is a valid, loadable MappingConfig using fictional data', () => {
    expect(EXAMPLE_NETSAPIENS_MAPPING.rules && EXAMPLE_NETSAPIENS_MAPPING.rules.length).toBeGreaterThan(0);
    expect(resolveOrgKey('acme42', EXAMPLE_NETSAPIENS_MAPPING)).toBe('acmevoice');
  });
});
