import { describe, it, expect } from 'vitest';
import { RingotelHttp, RingotelApiError } from './http.js';
import { mockRpcFetch } from './testkit.js';

describe('RingotelHttp', () => {
  it('POSTs {method, params} to {baseUrl}/api and unwraps result', async () => {
    const { fetchImpl, calls } = mockRpcFetch({ results: { getOrganizations: [{ id: '1' }] } });
    const http = new RingotelHttp({ token: 'k', baseUrl: 'https://shell.ringotel.co', fetchImpl });

    const res = await http.call('getOrganizations', { foo: 'bar' });

    expect(res).toEqual([{ id: '1' }]);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('https://shell.ringotel.co/api');
    expect(calls[0]!.method).toBe('getOrganizations');
    expect(calls[0]!.params).toEqual({ foo: 'bar' });
  });

  it('sends Bearer auth + JSON headers', async () => {
    const { fetchImpl, calls } = mockRpcFetch({ results: { getAccount: {} } });
    const http = new RingotelHttp({ token: 'secret-key', fetchImpl });

    await http.call('getAccount');

    expect(calls[0]!.headers['Authorization']).toBe('Bearer secret-key');
    expect(calls[0]!.headers['Content-Type']).toBe('application/json');
  });

  it('defaults baseUrl to https://shell.ringotel.co', async () => {
    const { fetchImpl, calls } = mockRpcFetch({ results: { getRegions: [] } });
    const http = new RingotelHttp({ token: 'k', fetchImpl });

    await http.call('getRegions');

    expect(calls[0]!.url).toBe('https://shell.ringotel.co/api');
  });

  it('normalizes a baseUrl that already includes /api or a trailing slash', async () => {
    const { fetchImpl, calls } = mockRpcFetch({ results: { getRegions: [] } });
    for (const base of ['https://x.example.co/', 'https://x.example.co/api', 'https://x.example.co/api/']) {
      const http = new RingotelHttp({ token: 'k', baseUrl: base, fetchImpl });
      await http.call('getRegions');
    }
    for (const c of calls) expect(c.url).toBe('https://x.example.co/api');
  });

  it('throws RingotelApiError on an in-band {error} even with HTTP 200', async () => {
    const { fetchImpl } = mockRpcFetch({ errors: { getUser: { code: 5, message: 'no such user' } } });
    const http = new RingotelHttp({ token: 'k', fetchImpl });

    await expect(http.call('getUser', { id: 'x', orgid: 'o' })).rejects.toMatchObject({
      name: 'RingotelApiError',
      status: 200,
      method: 'getUser',
    });
    await expect(http.call('getUser', {})).rejects.toThrow(/no such user/);
  });

  it('throws RingotelApiError on an HTTP error status', async () => {
    const { fetchImpl } = mockRpcFetch({ httpStatus: 401 });
    const http = new RingotelHttp({ token: 'bad', fetchImpl });

    const err = (await http.call('getOrganizations').catch((e) => e)) as RingotelApiError;
    expect(err).toBeInstanceOf(RingotelApiError);
    expect(err.status).toBe(401);
    expect(err.message).toMatch(/invalid/i); // 401 hint
  });

  it('surfaces a non-JSON error body as RingotelApiError, not a raw SyntaxError', async () => {
    const { fetchImpl } = mockRpcFetch({ httpStatus: 502, rawBody: '<html>Bad Gateway</html>' });
    const http = new RingotelHttp({ token: 'k', fetchImpl });

    const err = (await http.call('getOrganizations').catch((e) => e)) as RingotelApiError;
    expect(err).toBeInstanceOf(RingotelApiError);
    expect(err.status).toBe(502);
  });

  it('returns undefined result for an empty body', async () => {
    const { fetchImpl } = mockRpcFetch({ rawBody: '' });
    const http = new RingotelHttp({ token: 'k', fetchImpl });
    expect(await http.call('ping')).toBeUndefined();
  });

  it('truncates an oversized error `detail` to 500 chars for BOTH an object and a string body', async () => {
    // Regression for a ternary-precedence bug: `.slice(0, 500)` used to bind only to the string
    // branch, so a large JSON object error body was stringified and included UNTRUNCATED.
    const bigMessage = 'x'.repeat(1000);
    const objFetch = (async () =>
      new Response(JSON.stringify({ error: { message: bigMessage } }), { status: 500 })) as unknown as typeof fetch;
    const httpObj = new RingotelHttp({ token: 'k', fetchImpl: objFetch });
    const errObj = (await httpObj.call('getOrganizations').catch((e) => e)) as RingotelApiError;
    expect(errObj).toBeInstanceOf(RingotelApiError);
    expect(errObj.message.length).toBeLessThanOrEqual(500 + 50); // detail <= 500 chars + surrounding text

    const rawFetch = (async () => new Response(bigMessage, { status: 500 })) as unknown as typeof fetch;
    const httpStr = new RingotelHttp({ token: 'k', fetchImpl: rawFetch });
    const errStr = (await httpStr.call('getOrganizations').catch((e) => e)) as RingotelApiError;
    expect(errStr).toBeInstanceOf(RingotelApiError);
    expect(errStr.message.length).toBeLessThanOrEqual(500 + 50);
  });
});
