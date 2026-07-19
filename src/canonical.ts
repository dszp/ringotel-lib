/**
 * resolveCanonicalUser — classify the Ringotel user records at one extension (within one branch) into a
 * single verdict a consumer can act on. Pure and read-only: it decides, it does not mutate. Shared by the
 * SSO validator (ringotel-ns-sso) and, in future, sv-portal-kit's resolveRtUser, so both agree on what the
 * "canonical active user at an extension" is — the disagreement that caused SSO bricks.
 *
 * Verdicts:
 *   'active'          — exactly one record at the ext, activated (status === 1).
 *   'inactive-exists' — exactly one record at the ext, not activated.
 *   'none'            — no record at the ext.
 *   'ambiguous'       — more than one record at the ext (an active user beside a phantom/tombstone, etc.).
 *
 * `user` is the canonical pick: for one-record verdicts it is that record; for 'ambiguous' it is the record
 * carrying the SIP identity `<ext><suffix>` (username/authname); when no record holds that SIP identity,
 * the pick prefers an ACTIVE record (status === 1) over an inactive one, and only falls back to most
 * recently created as the final tiebreak among equally-active candidates — otherwise a newer but INACTIVE
 * record (e.g. a fresh tombstone/phantom) would outrank a working active user, and a healer following
 * `user` as "the one to keep" would delete the record actually in use. UNLESS two or more records share
 * the SIP identity, in which case it is unpickable and `user` is undefined. `matches` is every record at
 * the ext, so a healer can dedup the non-canonical ones.
 */

import type { User } from './model.js';

export type CanonicalVerdict = 'active' | 'inactive-exists' | 'none' | 'ambiguous';

export interface ResolveCanonicalOptions {
  /** Base NS/Ringotel extension, e.g. "100". */
  ext: string;
  /** Ringotel branch id the NS domain maps to (records in other branches are ignored). */
  branchid: string;
  /** NS device-name suffix, e.g. "r" → SIP identity "100r". */
  suffix: string;
}

export interface CanonicalResolution {
  verdict: CanonicalVerdict;
  user?: User;
  matches: User[];
}

export function resolveCanonicalUser(users: User[], opts: ResolveCanonicalOptions): CanonicalResolution {
  const { ext, branchid, suffix } = opts;
  const matches = users.filter(
    (u) => String(u.branchid ?? '') === branchid && String(u.extension ?? '') === ext,
  );

  if (matches.length === 0) return { verdict: 'none', matches };
  if (matches.length === 1) {
    const user = matches[0]!;
    return { verdict: Number(user.status) === 1 ? 'active' : 'inactive-exists', user, matches };
  }

  // More than one record at the extension → ambiguous. Pick the canonical for a healer to keep.
  const wantSip = ext + suffix;
  const sip = matches.filter(
    (u) => String(u.username ?? '') === wantSip || String(u.authname ?? '') === wantSip,
  );
  let user: User | undefined;
  if (sip.length === 1) user = sip[0];
  else if (sip.length === 0) {
    // No record holds the SIP identity: prefer an ACTIVE record over a merely-newer one, and use
    // most-recent `created` only as the final tiebreak among equally-active candidates.
    user = [...matches].sort((a, z) => {
      const activeDelta = (Number(z.status) === 1 ? 1 : 0) - (Number(a.status) === 1 ? 1 : 0);
      if (activeDelta !== 0) return activeDelta;
      return Number(z.created ?? 0) - Number(a.created ?? 0);
    })[0];
  }
  // sip.length > 1 → two records share the SIP identity → unpickable; leave user undefined.
  return { verdict: 'ambiguous', user, matches };
}
