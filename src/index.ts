/**
 * Public API of @dszp/ringotel-lib — the surface any host imports (Cloudflare Worker, Node, browser).
 * Everything re-exported here is Node-free and runtime-portable.
 *
 * READ-ONLY BOUNDARY: the raw transport `RingotelHttp` is deliberately NOT exported. A JSON-RPC API
 * can't be transport-gated (any method string is callable), so the read-only guarantee is enforced by
 * encapsulation — consumers get `RingotelReadClient` (no mutating methods) or `RingotelWriteClient`
 * (the sanctioned mutation surface), each holding the transport privately. Exporting RingotelHttp
 * would let a consumer bypass that in one line, so don't.
 *
 * Typical use:
 *   import { RingotelReadClient, resolveOrg, fetchOrgSnapshot } from '@dszp/ringotel-lib';
 *   const ns = new RingotelReadClient({ token });
 *   const orgs = await ns.getOrganizations();
 *   const org  = resolveOrg('demo.12345.service', orgs);       // NS domain → Ringotel org
 *   const snap = await fetchOrgSnapshot(ns, org.id);
 */

// Types (contract)
export type {
  Rec,
  RpcRequest,
  RpcResponse,
  RpcError,
  Organization,
  Branch,
  Device,
  User,
  SipCredentials,
  Region,
  Package,
  Contact,
  Template,
  SmsTrunk,
} from './model.js';

// Error + config type (NOT the RingotelHttp class — see boundary note above)
export { RingotelApiError, type RingotelHttpConfig } from './http.js';

// Read-only client
export { RingotelReadClient, type RingotelReadClientConfig } from './readClient.js';

// Write client (mutation surface — users, orgs, branches)
export {
  RingotelWriteClient,
  type RingotelWriteClientConfig,
  type CreateUserInput,
  type UpdateUserInput,
  type RecoverUserInput,
  type CreateOrgInput,
  type UpdateOrgInput,
  type CreateBranchInput,
  type UpdateBranchInput,
} from './writeClient.js';

// Snapshot gather helpers
export { fetchOrgSnapshot, listOrganizations, type OrgSnapshot, type FetchOrgSnapshotOptions } from './snapshot.js';

// Branch selection (single-branch default; multi-branch by host/name/id)
export { resolveBranch, resolveBranchOrThrow, branchHost, matchHost, type ResolveBranchOptions } from './branch.js';

// Org+branch directory (expensive gather → cache in consumer → pure local lookups)
export {
  buildOrgBranchIndex,
  findByAddress,
  findByHost,
  type OrgBranchEntry,
  type BuildIndexOptions,
} from './directory.js';

// Generic source → Ringotel-org mapping engine
export {
  resolveOrgKey,
  resolveOrgId,
  resolveOrg,
  findOrg,
  NETSAPIENS_DEFAULT_TRANSFORM,
  type MappingRule,
  type MappingConfig,
  type ResolveOrgIdOptions,
} from './mapping.js';

// Canonical-user resolution at an extension (shared with SSO validators to prevent drift)
export {
  resolveCanonicalUser,
  type CanonicalVerdict,
  type ResolveCanonicalOptions,
  type CanonicalResolution,
} from './canonical.js';
