/**
 * assessUserHealth — classify ONE Ringotel user record at an extension into deterministic health flags,
 * using only fields the API already returns on `getUsers`. Pure and read-only: it decides, it does not
 * mutate and it performs no I/O, so a consumer can run it over a cached user list at zero API cost.
 *
 * It exists because a Ringotel record can be broken in ways that are invisible in the admin UI — most
 * importantly the SSO "brick": approving a single-sign-on login against a deleted record leaves a user
 * that is active (`status: 1`), still carries a `trunkid`, and still bills, but has lost its `authname`
 * and can no longer be edited or deleted through the API. That state is exactly detectable, so it is
 * reported as a flag rather than left for someone to notice on a phone that will not register.
 *
 * Two field subtleties drive the rules, both confirmed against a live deployment:
 *   - `stime` ("last seen") is INITIALIZED AT CREATION. A record that has never had the app opened
 *     therefore reports a recent `stime`. Only `stime > created` means the user genuinely connected,
 *     which is what makes `never-connected` trustworthy as a billing signal.
 *   - `trunkstate` is a LIVENESS signal that decays with app inactivity — a long-dormant but perfectly
 *     healthy user reads `0`. It can therefore only ever produce the advisory `stale-registration`
 *     flag, never a 'broken' verdict, and must not be used to trigger automatic repair.
 *
 * `no-ns-device` is part of the flag vocabulary but is NEVER emitted here: it depends on the telephony
 * platform's device list, which this library does not read. A consumer that has fetched the user's
 * devices appends it to `flags` itself and recomputes severity with `worstSeverity`.
 */

import type { User } from './model.js';

/** A single detected condition on a Ringotel user record. */
export type HealthFlag =
  /** Active record with no SIP `authname` — the SSO brick. Un-editable, un-deletable, still billing. */
  | 'brick'
  /** `authname` is set but is not the expected `<ext><suffix>`, so the SIP identity cannot match. */
  | 'authname-drift'
  /** More than one record exists at this extension in this branch — the precursor to a brick. */
  | 'duplicate'
  /** Active record never linked to a PBX trunk. */
  | 'no-trunk'
  /** Active (and billing) but the app has never once been opened. */
  | 'never-connected'
  /** A deactivated/deleted remnant (`status === -1`). */
  | 'tombstone'
  /** Advisory only: connected at some point, but the trunk is not currently registered. */
  | 'stale-registration'
  /** Set by a CONSUMER, never by this function: the expected softphone device is absent upstream. */
  | 'no-ns-device';

/** How bad a flag is. `broken` = the user cannot work; `warn` = suspicious; `info` = worth knowing. */
export type HealthSeverity = 'ok' | 'info' | 'warn' | 'broken';

/** Severity of each flag. Exported so a consumer classifying `no-ns-device` agrees with this module. */
export const HEALTH_SEVERITY: Record<HealthFlag, HealthSeverity> = {
  brick: 'broken',
  'authname-drift': 'broken',
  duplicate: 'broken',
  'no-trunk': 'broken',
  'no-ns-device': 'broken',
  'stale-registration': 'warn',
  'never-connected': 'info',
  tombstone: 'info',
};

const SEVERITY_RANK: Record<HealthSeverity, number> = { ok: 0, info: 1, warn: 2, broken: 3 };

/** The worst severity across a set of flags; `ok` when there are none. */
export function worstSeverity(flags: HealthFlag[]): HealthSeverity {
  let worst: HealthSeverity = 'ok';
  for (const f of flags) {
    const s = HEALTH_SEVERITY[f];
    if (SEVERITY_RANK[s] > SEVERITY_RANK[worst]) worst = s;
  }
  return worst;
}

export interface AssessHealthOptions {
  /** Base extension the record should serve, e.g. "100". */
  ext: string;
  /** Device-name suffix, e.g. "r" → expected SIP identity "100r". */
  suffix: string;
  /** How many records exist at this extension in this branch. Above 1 ⇒ `duplicate`. Default 1. */
  siblingCount?: number;
}

export interface UserHealth {
  flags: HealthFlag[];
  severity: HealthSeverity;
}

export function assessUserHealth(user: User, opts: AssessHealthOptions): UserHealth {
  const { ext, suffix, siblingCount = 1 } = opts;
  const flags: HealthFlag[] = [];

  const status = Number(user.status);
  const active = status === 1;
  const authname = String(user.authname ?? '').trim();
  const created = Number(user.created);
  const stime = Number(user.stime);

  if (siblingCount > 1) flags.push('duplicate');

  if (!active) {
    // A non-active record cannot be "broken" in a way anyone can act on beyond removing it; report the
    // remnant and stop, so a tombstone does not also collect no-trunk/never-connected noise.
    if (status === -1) flags.push('tombstone');
    return { flags, severity: worstSeverity(flags) };
  }

  if (!authname) {
    // The brick. Deliberately exclusive with authname-drift: an absent authname is not "drifted", and
    // reporting both would imply two separate problems with two different remedies (there is one, and
    // it is the vendor purging the record).
    flags.push('brick');
  } else if (authname !== ext + suffix) {
    flags.push('authname-drift');
  }

  if (!String(user.trunkid ?? '').trim()) flags.push('no-trunk');

  // `stime` is seeded from `created`, so "never connected" is stime <= created — not a recency window.
  // Both must be finite: an API response missing either must not fabricate a billing accusation.
  if (Number.isFinite(created) && Number.isFinite(stime) && stime <= created) {
    flags.push('never-connected');
  } else if (Number(user.trunkstate) !== 1) {
    // Advisory only, and only for a record that HAS connected before — see the header note on decay.
    flags.push('stale-registration');
  }

  return { flags, severity: worstSeverity(flags) };
}
