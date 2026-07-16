/**
 * RingotelHttp — the single transport core for the Ringotel AdminAPI, and the one choke point every
 * call flows through. Ported in spirit from @dszp/netsapiens-lib's NsClient, but the Ringotel API is
 * a single-endpoint JSON-RPC service, not REST: every call is `POST {baseUrl}/api` with a body of
 * `{ method, params }`, success returns `{ result }`, and failure returns `{ error }` — frequently
 * over HTTP 200. `call()` unwraps `result` so callers never see the envelope.
 *
 * READ-ONLY BOUNDARY: unlike NsClient (which can hardcode the HTTP verb), a JSON-RPC endpoint cannot
 * be transport-gated — `call('deleteUser', …)` is always physically possible here. So this class is
 * deliberately NOT exported from the public barrel. The read-only guarantee is enforced by
 * encapsulation: RingotelReadClient holds a RingotelHttp privately and exposes only get* methods, and
 * RingotelWriteClient is the only sanctioned mutation surface. Keep RingotelHttp internal.
 *
 * Node-free: uses only Web `fetch`/`Response`. Runs unchanged in a Cloudflare Worker, Node, or the browser.
 */

import type { RpcError } from './model.js';

const DEFAULT_BASE_URL = 'https://shell.ringotel.co';

export class RingotelApiError extends Error {
  constructor(
    message: string,
    /** HTTP status (200 when the failure was in-band). */
    public readonly status: number,
    /** The RPC method that failed. */
    public readonly method: string,
    /** The in-band `error` object, if any. */
    public readonly rpcError: RpcError | undefined,
    /** The parsed (or raw) response body. */
    public readonly body: unknown,
  ) {
    super(message);
    this.name = 'RingotelApiError';
  }
}

export interface RingotelHttpConfig {
  /** API key — sent as `Authorization: Bearer <token>`. */
  token: string;
  /** Shell base URL. Default `https://shell.ringotel.co`. A trailing slash or `/api` is normalized away. */
  baseUrl?: string;
  /** Injectable for tests / non-global fetch. */
  fetchImpl?: typeof fetch;
}

/** Human hint appended to auth-failure messages, mirroring NsClient. */
function hint(status: number): string {
  if (status === 401) return ' (API key invalid or expired)';
  if (status === 403) return ' (API key lacks permission for this call)';
  return '';
}

export class RingotelHttp {
  readonly #endpoint: string;
  readonly #token: string;
  readonly #fetchImpl: typeof fetch;

  constructor(cfg: RingotelHttpConfig) {
    const base = (cfg.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '').replace(/\/api$/i, '');
    this.#endpoint = `${base}/api`;
    this.#token = cfg.token;
    this.#fetchImpl = cfg.fetchImpl ?? fetch;
  }

  /**
   * Issue one JSON-RPC call and return the unwrapped `result`. Throws RingotelApiError on an HTTP
   * error status OR an in-band `{ error }` (including HTTP 200 with an error).
   */
  async call<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    // Call via a local, NOT `this.fetchImpl(...)`: invoking the global fetch as a method of this
    // instance throws "Illegal invocation" in workerd (the global fetch requires a global `this`).
    const doFetch = this.#fetchImpl;
    const res = await doFetch(this.#endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.#token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ method, params }),
    });

    // Guard the parse: a proxy 502/504 (HTML body) or any non-JSON error body must surface as a
    // RingotelApiError carrying the status — never a raw SyntaxError that hides it.
    const text = await res.text();
    let parsed: any = text;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        /* leave `parsed` as the raw text */
      }
    }

    if (!res.ok) {
      const detail = parsed && typeof parsed === 'object' ? JSON.stringify(parsed) : String(parsed).slice(0, 500);
      throw new RingotelApiError(`${method} → ${res.status}${hint(res.status)}: ${detail}`, res.status, method, parsed?.error, parsed);
    }
    if (parsed && typeof parsed === 'object' && parsed.error) {
      const msg = (parsed.error as RpcError)?.message ?? 'unknown error';
      throw new RingotelApiError(`${method}: ${msg}`, res.status, method, parsed.error, parsed);
    }
    return parsed?.result as T;
  }
}
