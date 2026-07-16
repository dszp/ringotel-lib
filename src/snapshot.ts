/**
 * Higher-level "gather everything about an org" helpers, layered over RingotelReadClient — the
 * Ringotel analogue of @dszp/netsapiens-lib's `fetchDomainSnapshot`. Free functions (not client
 * methods), so the read client stays a thin transport surface.
 *
 * Note on concurrency: unlike NetSapiens (which needs per-user/queue fan-out and a bounded `mapLimit`),
 * the Ringotel AdminAPI returns each collection in a single aggregate call (getBranches/getUsers/…),
 * so a snapshot is just a handful of parallel list reads — no per-item fan-out to bound. If a future
 * deep mode fetches per-user detail, add a bounded map then.
 */

import type { RingotelReadClient } from './readClient.js';
import type { Branch, Contact, Organization, Rec, SmsTrunk, User } from './model.js';
import { RingotelApiError } from './http.js';

export interface OrgSnapshot {
  meta: { orgid: string };
  organization?: Organization;
  branches: Branch[];
  users: User[];
  contacts: Contact[];
  smsTrunks: SmsTrunk[];
  [k: string]: any;
}

export interface FetchOrgSnapshotOptions {
  /** Skip the optional reads (contacts, sms trunks) — org + branches + users only. Default false. */
  shallow?: boolean;
  /** Include contacts. Default true (ignored when `shallow`). */
  includeContacts?: boolean;
  /** Include SMS trunks. Default true (ignored when `shallow`). */
  includeSmsTrunks?: boolean;
}

/** Run an optional read, treating a RingotelApiError as "absent" (empty) so one gap never aborts the gather. */
async function soft<T>(fn: () => Promise<T[]>): Promise<T[]> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof RingotelApiError) return [];
    throw err;
  }
}

/**
 * Read a live org into an `OrgSnapshot`. Essentials (organization, branches, users) are gathered hard
 * — an access/auth failure there throws. Optional reads (contacts, sms trunks) are soft — a failure
 * yields an empty list rather than aborting the whole snapshot.
 */
export async function fetchOrgSnapshot(client: RingotelReadClient, orgid: string, opts: FetchOrgSnapshotOptions = {}): Promise<OrgSnapshot> {
  // Anchor read — validates access to the org and throws on auth failure.
  const organization = await client.getOrganization(orgid);
  const [branches, users] = await Promise.all([client.getBranches(orgid), client.getUsers(orgid)]);

  let contacts: Contact[] = [];
  let smsTrunks: SmsTrunk[] = [];
  if (!opts.shallow) {
    [contacts, smsTrunks] = await Promise.all([
      (opts.includeContacts ?? true) ? soft<Rec>(() => client.getContacts(orgid)) : Promise.resolve([]),
      (opts.includeSmsTrunks ?? true) ? soft<Rec>(() => client.getSMSTrunks(orgid)) : Promise.resolve([]),
    ]);
  }

  return { meta: { orgid }, organization, branches, users, contacts, smsTrunks };
}

/** List all organizations the API key can see (the directory used to resolve org keys → orgid). */
export function listOrganizations(client: RingotelReadClient): Promise<Organization[]> {
  return client.getOrganizations();
}
