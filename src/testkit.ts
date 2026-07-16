/**
 * Shared test helpers — a mock JSON-RPC `fetch` that emulates the Ringotel AdminAPI endpoint.
 *
 * NOT part of the shipped library: this file is excluded from the tsc build (see tsconfig.json
 * `exclude`) so it never lands in `dist/`, and only `dist/` + README are published. It is still
 * type-checked via `tsconfig.test.json`. Kept Node-free (Web `Response` only) like the rest of src/.
 */

export interface RpcCall {
  method: string;
  params: Record<string, unknown>;
  url: string;
  headers: Record<string, string>;
}

export interface MockRpcOptions {
  /** Catch-all: given the parsed call, return the `result` payload. */
  handler?: (call: RpcCall) => unknown;
  /** Per-method result (value or a function of params). Ignored if `handler` is set. */
  results?: Record<string, unknown | ((params: Record<string, unknown>) => unknown)>;
  /** Methods that return an in-band `{ error }` (HTTP 200). */
  errors?: Record<string, { code?: number | string; message?: string }>;
  /** Force an HTTP status for every call (>=400 exercises the HTTP-error path). */
  httpStatus?: number;
  /** Return a non-JSON body verbatim (exercises the parse guard). */
  rawBody?: string;
}

/** Build a mock `fetch` for the JSON-RPC endpoint plus a recorded list of calls for assertions. */
export function mockRpcFetch(opts: MockRpcOptions = {}): { fetchImpl: typeof fetch; calls: RpcCall[] } {
  const calls: RpcCall[] = [];
  const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? '{}'));
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries((init?.headers as Record<string, string>) ?? {})) headers[k] = v;
    const call: RpcCall = { method: body.method, params: body.params ?? {}, url: String(url), headers };
    calls.push(call);

    if (opts.rawBody !== undefined) {
      return new Response(opts.rawBody, { status: opts.httpStatus ?? 200 });
    }
    if (opts.httpStatus && opts.httpStatus >= 400) {
      return new Response(JSON.stringify({ error: { message: 'upstream failure' } }), { status: opts.httpStatus });
    }
    if (opts.errors && call.method in opts.errors) {
      return new Response(JSON.stringify({ error: opts.errors[call.method] }), { status: 200 });
    }
    let result: unknown;
    if (opts.handler) {
      result = opts.handler(call);
    } else if (opts.results && call.method in opts.results) {
      const r = opts.results[call.method];
      result = typeof r === 'function' ? (r as (p: Record<string, unknown>) => unknown)(call.params) : r;
    }
    return new Response(JSON.stringify({ result }), { status: 200 });
  }) as unknown as typeof fetch;

  return { fetchImpl, calls };
}
