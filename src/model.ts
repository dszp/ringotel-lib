/**
 * Shared types for the Ringotel AdminAPI toolkit — the contract every other module speaks.
 *
 * Typing philosophy (copied from @dszp/netsapiens-lib's model): the Ringotel API returns rich JSON
 * whose exact shape drifts and is only example-documented (the Postman collections carry no JSON
 * Schema). So we type ONLY the fields the library reads, and keep every record index-signature-open
 * (`[k: string]: any`). Drift in unrelated fields never breaks the build, and callers can still reach
 * any field the API returns. IDs are large numeric **strings** throughout.
 */

/** A loose record — any Ringotel object whose full shape we don't pin down. */
export type Rec = Record<string, any>;

// ── JSON-RPC envelope ────────────────────────────────────────────────────────
// Every AdminAPI call is `POST {baseUrl}/api` with a `{ method, params }` body. Success returns
// `{ result }`; failure returns `{ error }` — often over HTTP 200. `RingotelHttp` unwraps `result`
// so callers never see the envelope.

/** Request body sent to the single AdminAPI endpoint. */
export interface RpcRequest {
  method: string;
  params: Record<string, unknown>;
}

/** Raw envelope returned by the endpoint (before unwrapping). */
export interface RpcResponse<T = unknown> {
  result?: T;
  error?: RpcError;
  [k: string]: any;
}

/** In-band error object (present even when the HTTP status is 200). */
export interface RpcError {
  code?: number | string;
  message?: string;
  [k: string]: any;
}

// ── AdminAPI entities (loose) ────────────────────────────────────────────────

/** A Ringotel organization (a tenant / customer). `orgid` is the universal key across the API. */
export interface Organization {
  /** The org id — the value passed as `orgid`/`id` everywhere else. */
  id: string;
  domain?: string;
  name?: string;
  region?: string;
  status?: number;
  packageid?: number;
  admlogin?: string;
  created?: number;
  params?: Rec;
  [k: string]: any;
}

/** A Ringotel branch (the n8n node calls this a "Connection"). Holds the PBX/SIP `provision` config. */
export interface Branch {
  id: string;
  orgid?: string;
  accountid?: string;
  domain?: string;
  name?: string;
  country?: string;
  address?: string;
  created?: number;
  /** Large PBX/SIP config blob — left loose. */
  provision?: Rec;
  [k: string]: any;
}

/** A device attached to a user (element of `User.devs`). No standalone device endpoint exists. */
export interface Device {
  /** Device id / serial, e.g. "5CD0155YHH". */
  id: string;
  /** Per-device registration state (verified live 2026-07-15): **0 = offline, 1 = online, 2 = available
   *  (push-reachable)**. NOT a boolean and NOT "0 = online" — a fully offline user's devices are `st:0`.
   *  For user-level PRESENCE use `User.state`, not this. */
  st?: number;
  ip?: string;
  /** User agent, e.g. "Windows 10". */
  ua?: string;
  /** Last-activity time for this device (ms epoch). */
  ts?: number;
  [k: string]: any;
}

/**
 * A Ringotel app user. Note the API user object does NOT echo `orgid`; the read client can
 * re-inject it as a convenience (opt-in), mirroring the n8n node.
 */
export interface User {
  id: string;
  branchid?: string;
  domain?: string;
  name?: string;
  extension?: string;
  username?: string;
  authname?: string;
  /** Provisioning/activation: **1 = activated** (the app is set up for this extension), 0 = unactivated. */
  status?: number;
  /** USER PRESENCE — the authoritative live status, matching the Ringotel admin panel's "State" column
   *  (verified 2026-07-15 vs help.ringotel.com/en/articles/11191265): **0 = Offline, 1 = Online,
   *  2 = Available, 5 = Available on PBX**; other non-zero values (Busy / Do Not Disturb / At the Desk)
   *  also mean the app is registered. Use THIS for presence — device `st` is per-device and easy to
   *  mis-read (see `Device.st`). The only "app-not-really-there" states are 0 (Offline) and 5 (PBX-only). */
  state?: number;
  note?: string;
  trunkid?: string;
  /** PBX/SIP trunk registration for the extension: 1 = registered, 0 = not. */
  trunkstate?: number;
  created?: number;
  /** Last-activity time (ms epoch) — the user's "last seen". */
  stime?: number;
  /** Active devices attached to this user. */
  devs?: Device[];
  /** Not returned by the API — re-injected by the client when `injectOrgId` is enabled. */
  orgid?: string;
  [k: string]: any;
}

/** SIP credentials for a user (`getSIPCredentials`). `authname` is the numeric userid, `username` the extension. */
export interface SipCredentials {
  server?: string;
  username?: string;
  authname?: string;
  password?: string;
  [k: string]: any;
}

/** A provisioning region (`getRegions`). */
export type Region = Rec;

/** A subscription package (`getPackages`). */
export type Package = Rec;

/** A contact (`getContacts` / `getBlockedContacts`). */
export type Contact = Rec;

/** A branch provisioning template (`getTemplates`). */
export type Template = Rec;

/** An SMS trunk (`getSMSTrunks`). */
export type SmsTrunk = Rec;
