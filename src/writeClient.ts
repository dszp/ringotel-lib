/**
 * RingotelWriteClient — the sanctioned MUTATION surface for the Ringotel AdminAPI.
 *
 * Like the read client, it holds a RingotelHttp PRIVATELY (the raw transport is never exposed) — but
 * here mutating methods are the point. Keeping reads and writes in two classes over one private
 * transport is the read-only guarantee: a consumer that only wants to read constructs a
 * RingotelReadClient and has no write method to call. Policy (allowlists, confirmation, audit) belongs
 * in the CONSUMER, not here — this class is mechanism only. Mirrors netsapiens-lib's read/write split.
 *
 * Param mapping: the AdminAPI is inconsistent about the user key (`id` in deleteUser/updateUser/…,
 * `userid` in setUserPassword/deleteDevice/…) and overloads `id` to mean the branch id in
 * attachUser/detachUser. Methods here take clearly-named TS args (userid, branchid, id) and map them
 * to the exact RPC keys per the vendor Postman collection, so callers never deal with that ambiguity.
 * Shapes marked "spec" were taken from RingotelAdminAPI.json; verify against a live demo org before
 * trusting in production.
 */

import { RingotelHttp, type RingotelHttpConfig } from './http.js';
import type { Branch, Organization, Rec, User } from './model.js';

export type RingotelWriteClientConfig = RingotelHttpConfig;

// ── Input types ────────────────────────────────────────────────────────────────

/** Fields for `createUser`. `orgid`, `branchid`, `name`, `extension` are required. */
export interface CreateUserInput {
  orgid: string;
  branchid: string;
  name: string;
  extension: string;
  domain?: string;
  status?: number;
  username?: string;
  password?: string;
  authname?: string;
  email?: string;
  mobile?: string;
  phone?: string;
  company?: string;
  position?: string;
  [k: string]: unknown;
}

/** Mutable user fields for `updateUser` (the user is addressed separately by userid). */
export interface UpdateUserInput {
  name?: string;
  extension?: string;
  username?: string;
  authname?: string;
  email?: string;
  mobile?: string;
  phone?: string;
  company?: string;
  position?: string;
  [k: string]: unknown;
}

/** Fields for `recoverDeletedUser` — matched by identity, not by id/orgid. */
export interface RecoverUserInput {
  name: string;
  domain: string;
  extension: string;
  username?: string;
  password?: string;
  authname?: string;
  email?: string;
  [k: string]: unknown;
}

/** Fields for `createOrganization`. `name`, `region`, `domain` required; `params` is the options blob. */
export interface CreateOrgInput {
  name: string;
  region: string;
  domain: string;
  params?: Rec;
  [k: string]: unknown;
}

/** Mutable org fields for `updateOrganization` (the org is addressed separately by id). */
export interface UpdateOrgInput {
  name?: string;
  admlogin?: string;
  admpassw?: string;
  params?: Rec;
  packageid?: number;
  [k: string]: unknown;
}

/** Fields for `createBranch`. `provision` is the large PBX/SIP config blob. */
export interface CreateBranchInput {
  orgid: string;
  name: string;
  address: string;
  country: string;
  provision: Rec;
  [k: string]: unknown;
}

/** Mutable branch fields for `updateBranch` (the branch is addressed separately by id + orgid). */
export interface UpdateBranchInput {
  name?: string;
  address?: string;
  country?: string;
  provision?: Rec;
  [k: string]: unknown;
}

export class RingotelWriteClient {
  private readonly http: RingotelHttp;

  constructor(cfg: RingotelWriteClientConfig) {
    this.http = new RingotelHttp(cfg);
  }

  // ── Users ──────────────────────────────────────────────────────────────────
  /** Create a user in a branch. Returns the created user. */
  createUser(input: CreateUserInput): Promise<User> {
    return this.http.call<User>('createUser', { ...input });
  }
  /** Bulk-create users in a branch. `users` is an array of per-user field objects. */
  createUsers(orgid: string, branchid: string, users: Rec[]): Promise<Rec> {
    return this.http.call<Rec>('createUsers', { orgid, branchid, users });
  }
  /** Update mutable fields on a user. (RPC key: `id` = userid.) */
  updateUser(userid: string, orgid: string, changes: UpdateUserInput): Promise<User> {
    return this.http.call<User>('updateUser', { orgid, id: userid, ...changes });
  }
  /** Delete a user. (RPC key: `id` = userid.) */
  deleteUser(userid: string, orgid: string): Promise<Rec> {
    return this.http.call<Rec>('deleteUser', { id: userid, orgid });
  }
  /** Bulk-delete users. `users` is an array of user ids (or per-API objects). */
  deleteUsers(orgid: string, users: Array<string | Rec>): Promise<Rec> {
    return this.http.call<Rec>('deleteUsers', { orgid, users });
  }
  /** Deactivate a user without deleting. (RPC key: `id` = userid.) */
  deactivateUser(userid: string, orgid: string): Promise<Rec> {
    return this.http.call<Rec>('deactivateUser', { id: userid, orgid });
  }
  /** Recover a previously deleted user (matched by identity fields, not id). */
  recoverDeletedUser(input: RecoverUserInput): Promise<User> {
    return this.http.call<User>('recoverDeletedUser', { ...input });
  }
  /**
   * Link an *unactivated* user as an extension of an *activated* user, so they share one app login.
   * This is the admin UI's "Add extension" flow, done in two steps: first `createUser` the extension
   * on the target connection (it is created unactivated), THEN `attachUser` it to the primary
   * activated user. BOTH args are USER ids — not branch ids. (RPC: `id` = unactivated user, `userid`
   * = activated user.)
   */
  attachUser(unactivatedUserId: string, activatedUserId: string, orgid: string): Promise<Rec> {
    return this.http.call<Rec>('attachUser', { id: unactivatedUserId, userid: activatedUserId, orgid });
  }
  /** Unlink an unactivated user extension from its activated user. (RPC: `id` = unactivated, `userid` = activated.) */
  detachUser(unactivatedUserId: string, activatedUserId: string, orgid: string): Promise<Rec> {
    return this.http.call<Rec>('detachUser', { id: unactivatedUserId, userid: activatedUserId, orgid });
  }
  /** Set a user's status. (RPC key: `id` = userid.) */
  setUserStatus(userid: string, orgid: string, status: number): Promise<Rec> {
    return this.http.call<Rec>('setUserStatus', { id: userid, orgid, status });
  }
  /** Set a user's do-not-disturb state. (RPC key: `id` = userid, `dnd` = the state.) */
  setUserState(userid: string, orgid: string, dnd: boolean): Promise<Rec> {
    return this.http.call<Rec>('setUserState', { id: userid, orgid, dnd });
  }
  /** Set a user's password. (RPC key: `userid`.) */
  setUserPassword(userid: string, orgid: string, password: string): Promise<Rec> {
    return this.http.call<Rec>('setUserPassword', { orgid, userid, password });
  }
  /** Reset a user's password (server-generated). (RPC key: `id` = userid.) */
  resetUserPassword(userid: string, orgid: string): Promise<Rec> {
    return this.http.call<Rec>('resetUserPassword', { id: userid, orgid });
  }
  /** Merge settings onto a user. (RPC key: `id` = userid; settings are spread as top-level params.) */
  setUserSettings(userid: string, orgid: string, settings: Rec): Promise<Rec> {
    return this.http.call<Rec>('setUserSettings', { id: userid, orgid, ...settings });
  }
  /** Resync a user's SIP device. (RPC keys: `userid`, `termid` = device id.) */
  resyncSIPDevice(userid: string, orgid: string, termid: string): Promise<Rec> {
    return this.http.call<Rec>('resyncSIPDevice', { orgid, userid, termid });
  }
  /** Delete one of a user's devices. (RPC keys: `userid`, `termid` = device id.) */
  deleteDevice(userid: string, orgid: string, termid: string): Promise<Rec> {
    return this.http.call<Rec>('deleteDevice', { orgid, userid, termid });
  }

  // ── Organizations ────────────────────────────────────────────────────────────
  /** Create an organization. Returns the created org. */
  createOrganization(input: CreateOrgInput): Promise<Organization> {
    return this.http.call<Organization>('createOrganization', { ...input });
  }
  /** Update mutable org fields (org addressed by id). */
  updateOrganization(id: string, changes: UpdateOrgInput): Promise<Organization> {
    return this.http.call<Organization>('updateOrganization', { id, ...changes });
  }
  /** Delete an organization. */
  deleteOrganization(id: string): Promise<Rec> {
    return this.http.call<Rec>('deleteOrganization', { id });
  }
  /** Set an organization's status. */
  setOrganizationStatus(id: string, status: number): Promise<Rec> {
    return this.http.call<Rec>('setOrganizationStatus', { id, status });
  }

  // ── Branches ──────────────────────────────────────────────────────────────────
  /** Create a branch under an org. Returns the created branch. */
  createBranch(input: CreateBranchInput): Promise<Branch> {
    return this.http.call<Branch>('createBranch', { ...input });
  }
  /** Update mutable branch fields (branch addressed by id + orgid). */
  updateBranch(id: string, orgid: string, changes: UpdateBranchInput): Promise<Branch> {
    return this.http.call<Branch>('updateBranch', { orgid, id, ...changes });
  }
  /** Delete a branch. */
  deleteBranch(id: string, orgid: string): Promise<Rec> {
    return this.http.call<Rec>('deleteBranch', { id, orgid });
  }
  /** Set a branch's status. */
  setBranchStatus(id: string, orgid: string, status: number): Promise<Rec> {
    return this.http.call<Rec>('setBranchStatus', { id, orgid, status });
  }

  // Deferred (add with tests when needed): contacts (import/update/delete, setContactBlocked),
  // SMS trunks, AI agents, account admins, initCall/updateActivity.
}
