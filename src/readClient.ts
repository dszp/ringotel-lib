/**
 * RingotelReadClient — the read-only surface of the Ringotel AdminAPI.
 *
 * This is the read-only guarantee for a JSON-RPC API that can't be transport-gated: the client holds
 * a RingotelHttp PRIVATELY and exposes ONLY get* methods. There is deliberately no generic `call()`
 * escape hatch and no mutating method here. Writes live exclusively in the (separate)
 * RingotelWriteClient. RingotelHttp is never exported from the public barrel, so a consumer cannot
 * reach the raw transport to bypass this surface. Keep it that way.
 *
 * Param shapes are verified against the Ringotel Postman collection. Note three reads are NOT the
 * usual `{orgid}`: getTemplates() is account-level ({}), getUserLogs is keyed by {userid, domain},
 * and getPhoneBookURL is per-user with a device {format}.
 */

import { RingotelHttp, type RingotelHttpConfig } from './http.js';
import type {
  Branch,
  Contact,
  Organization,
  Package,
  Rec,
  Region,
  SipCredentials,
  SmsTrunk,
  Template,
  User,
} from './model.js';

export interface RingotelReadClientConfig extends RingotelHttpConfig {
  /**
   * Re-inject `orgid` onto getUsers/getUser results (the API omits it), matching the n8n node's
   * convenience. Opt-in — default false, so results are exactly what the API returned.
   */
  injectOrgId?: boolean;
}

export class RingotelReadClient {
  readonly #http: RingotelHttp;
  private readonly injectOrgId: boolean;

  constructor(cfg: RingotelReadClientConfig) {
    this.#http = new RingotelHttp(cfg);
    this.injectOrgId = cfg.injectOrgId ?? false;
  }

  // ── Organizations ──────────────────────────────────────────────────────────
  getOrganizations(): Promise<Organization[]> {
    return this.#http.call<Organization[]>('getOrganizations');
  }
  getOrganization(id: string): Promise<Organization> {
    return this.#http.call<Organization>('getOrganization', { id });
  }

  // ── Branches (a.k.a. "Connections") ──────────────────────────────────────────
  getBranches(orgid: string): Promise<Branch[]> {
    return this.#http.call<Branch[]>('getBranches', { orgid });
  }
  getBranch(id: string, orgid: string): Promise<Branch> {
    return this.#http.call<Branch>('getBranch', { id, orgid });
  }
  getBranchOptions(id: string, orgid: string): Promise<Rec> {
    return this.#http.call<Rec>('getBranchOptions', { id, orgid });
  }
  /** Branch provisioning templates — account-level, no orgid. */
  getTemplates(): Promise<Template[]> {
    return this.#http.call<Template[]>('getTemplates');
  }

  // ── Users ────────────────────────────────────────────────────────────────────
  async getUsers(orgid: string, branchid?: string): Promise<User[]> {
    const params: Record<string, unknown> = { orgid };
    if (branchid !== undefined) params.branchid = branchid;
    const users = await this.#http.call<User[]>('getUsers', params);
    return this.injectOrgId && Array.isArray(users) ? users.map((u) => ({ ...u, orgid })) : users;
  }
  async getUser(id: string, orgid: string): Promise<User> {
    const user = await this.#http.call<User>('getUser', { id, orgid });
    return this.injectOrgId && user && typeof user === 'object' ? { ...user, orgid } : user;
  }
  getSIPCredentials(orgid: string, userid: string, protocol?: string, termpass?: boolean): Promise<SipCredentials> {
    const params: Record<string, unknown> = { orgid, userid };
    if (protocol !== undefined) params.protocol = protocol;
    if (termpass !== undefined) params.termpass = termpass;
    return this.#http.call<SipCredentials>('getSIPCredentials', params);
  }
  getUserRegistrationsHistory(orgid: string, userid: string, begin?: number, end?: number): Promise<Rec> {
    const params: Record<string, unknown> = { orgid, userid };
    if (begin !== undefined) params.begin = begin;
    if (end !== undefined) params.end = end;
    return this.#http.call<Rec>('getUserRegistrationsHistory', params);
  }
  /** User log entries — keyed by {userid, domain} (a domain string, not orgid). */
  getUserLogs(userid: string, domain: string): Promise<Rec> {
    return this.#http.call<Rec>('getUserLogs', { userid, domain });
  }
  /** Phonebook provisioning URL — per-user, with a device {format} (e.g. "Yealink"). */
  getPhoneBookURL(orgid: string, userid: string, format: string): Promise<Rec> {
    return this.#http.call<Rec>('getPhoneBookURL', { orgid, userid, format });
  }

  // ── Contacts ─────────────────────────────────────────────────────────────────
  getContacts(orgid: string): Promise<Contact[]> {
    return this.#http.call<Contact[]>('getContacts', { orgid });
  }
  getBlockedContacts(orgid: string): Promise<Contact[]> {
    return this.#http.call<Contact[]>('getBlockedContacts', { orgid });
  }

  // ── Account / meta ────────────────────────────────────────────────────────────
  getAccount(): Promise<Rec> {
    return this.#http.call<Rec>('getAccount');
  }
  getAccountUsers(): Promise<Rec[]> {
    return this.#http.call<Rec[]>('getAccountUsers');
  }
  getAccountStatistics(begin: number, end: number): Promise<Rec> {
    return this.#http.call<Rec>('getAccountStatistics', { begin, end });
  }
  getRegions(): Promise<Region[]> {
    return this.#http.call<Region[]>('getRegions');
  }
  getPackages(): Promise<Package[]> {
    return this.#http.call<Package[]>('getPackages');
  }
  getServices(orgid: string): Promise<Rec[]> {
    return this.#http.call<Rec[]>('getServices', { orgid });
  }
  getSMSTrunks(orgid: string): Promise<SmsTrunk[]> {
    return this.#http.call<SmsTrunk[]>('getSMSTrunks', { orgid });
  }
  getAgents(orgid: string): Promise<Rec[]> {
    return this.#http.call<Rec[]>('getAgents', { orgid });
  }
}
