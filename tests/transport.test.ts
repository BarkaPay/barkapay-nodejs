import { describe, expect, it } from 'vitest';

import { ApiClient, parseRetryAfter, type ApiClientOptions } from '../src/apiClient';
import {
  ApiError,
  NetworkError,
  NotFoundError,
  PayHub,
  RateLimitError,
  ServiceUnavailableError,
} from '../src/index';
import { FakeFetch, hang, jsonResponse, ok, textResponse, type Reply } from './fakeFetch';

/** An ApiClient whose sleeps are recorded instead of waited. */
function harness(replies: Reply[], overrides: Partial<ApiClientOptions> = {}) {
  const http = new FakeFetch(replies);
  const sleeps: number[] = [];
  const api = new ApiClient({
    fetchFn: http.fn,
    authorization: 'Bearer pk_live_key:sk_live_secret',
    baseUrl: 'https://hub.barkapay.com',
    defaultCountry: 'bf',
    maxRetries: 2,
    timeoutMs: 1000,
    userAgent: 'test',
    sleep: (ms) => {
      sleeps.push(ms);
      return Promise.resolve();
    },
    random: () => 0.5,
    ...overrides,
  });
  return { api, http, sleeps };
}

const unavailable = jsonResponse(503, {
  status: 'error',
  code: 'service_unavailable',
  message: 'down',
});
const throttled = (retryAfter?: string): Reply =>
  jsonResponse(
    429,
    { status: 'error', code: 'too_many_requests', message: 'slow down' },
    retryAfter === undefined ? {} : { 'Retry-After': retryAfter },
  );

describe('retries — idempotent requests', () => {
  it('retries a GET on network failure, then succeeds', async () => {
    const { api, http, sleeps } = harness([
      new Error('socket hang up'),
      ok({ up: true }),
    ]);

    await expect(api.request('GET', 'ping')).resolves.toMatchObject({
      data: { up: true },
    });
    expect(http.calls).toHaveLength(2);
    expect(sleeps).toHaveLength(1);
  });

  it.each([408, 429, 502, 503, 504])('retries a GET on HTTP %i', async (status) => {
    const { api, http } = harness([
      jsonResponse(status, { status: 'error', code: 'x', message: 'x' }),
      ok({}),
    ]);

    await api.request('GET', 'balance');
    expect(http.calls).toHaveLength(2);
  });

  it.each([400, 401, 403, 404, 409, 422, 424, 500])(
    'does not retry a GET on HTTP %i',
    async (status) => {
      const { api, http } = harness([
        jsonResponse(status, { status: 'failed', code: 'x', message: 'x' }),
        ok({}),
      ]);

      await expect(api.request('GET', 'balance')).rejects.toBeInstanceOf(ApiError);
      expect(http.calls).toHaveLength(1);
    },
  );

  it('gives up after maxRetries and surfaces the last error', async () => {
    const { api, http, sleeps } = harness([
      unavailable,
      unavailable,
      unavailable,
      ok({}),
    ]);

    await expect(api.request('GET', 'balance')).rejects.toBeInstanceOf(
      ServiceUnavailableError,
    );
    expect(http.calls).toHaveLength(3); // 1 try + 2 retries
    expect(sleeps).toHaveLength(2);
  });

  it('backs off exponentially with jitter', async () => {
    const low = harness([unavailable, unavailable, unavailable], { random: () => 0 });
    await expect(low.api.request('GET', 'balance')).rejects.toBeInstanceOf(ApiError);
    expect(low.sleeps).toEqual([250, 500]); // 50 % of 500, 50 % of 1000

    const high = harness([unavailable, unavailable, unavailable], { random: () => 1 });
    await expect(high.api.request('GET', 'balance')).rejects.toBeInstanceOf(ApiError);
    expect(high.sleeps).toEqual([500, 1000]); // 100 % of 500, 100 % of 1000
  });

  it('caps the backoff', async () => {
    const { api, sleeps } = harness(Array<Reply>(11).fill(unavailable), {
      maxRetries: 10,
      random: () => 1,
    });

    await expect(api.request('GET', 'balance')).rejects.toBeInstanceOf(ApiError);
    expect(Math.max(...sleeps)).toBe(8000);
  });

  it('honours Retry-After (never earlier than the server asked)', async () => {
    const { api, sleeps } = harness([throttled('7'), ok({})], { random: () => 0 });

    await api.request('GET', 'payments');
    expect(sleeps).toEqual([7000]);
  });

  it('does not sleep on an unreasonable Retry-After: the error carries it', async () => {
    const { api, http, sleeps } = harness([throttled('3600'), ok({})]);

    const error = await api.request('GET', 'payments').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RateLimitError);
    expect((error as RateLimitError).retryAfter).toBe(3600);
    expect(http.calls).toHaveLength(1);
    expect(sleeps).toEqual([]);
  });

  it('never retries when maxRetries is 0', async () => {
    const { api, http } = harness([unavailable, ok({})], { maxRetries: 0 });

    await expect(api.request('GET', 'balance')).rejects.toBeInstanceOf(ApiError);
    expect(http.calls).toHaveLength(1);
  });
});

describe('retries — requests that create something or move money', () => {
  it('does NOT replay a POST after a network failure', async () => {
    const { api, http } = harness([new Error('socket hang up'), ok({})]);

    await expect(api.request('POST', 'transfers', { body: {} })).rejects.toBeInstanceOf(
      NetworkError,
    );
    expect(http.calls).toHaveLength(1);
  });

  it('does NOT replay a POST after a timeout', async () => {
    const { api, http } = harness([hang, ok({})], { timeoutMs: 20 });

    const error = await api
      .request('POST', 'payments', { body: {} })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NetworkError);
    expect((error as NetworkError).timedOut).toBe(true);
    expect((error as NetworkError).message).toBe(
      'The POST request timed out after 20 ms. ' +
        'The API may still have processed it: check before sending it again.',
    );
    expect(http.calls).toHaveLength(1);
  });

  it.each([500, 502, 503, 504])('does NOT replay a POST on HTTP %i', async (status) => {
    const { api, http } = harness([
      jsonResponse(status, { status: 'error', code: 'x', message: 'x' }),
      ok({}),
    ]);

    await expect(api.request('POST', 'transfers', { body: {} })).rejects.toBeInstanceOf(
      ApiError,
    );
    expect(http.calls).toHaveLength(1);
  });

  it('replays a POST on 429 — the one answer that proves nothing was done', async () => {
    const { api, http, sleeps } = harness([throttled('2'), ok({ fine: true })], {
      random: () => 0,
    });

    await expect(api.request('POST', 'transfers', { body: {} })).resolves.toMatchObject({
      data: { fine: true },
    });
    expect(http.calls).toHaveLength(2);
    expect(sleeps).toEqual([2000]);
  });

  it('retries an explicitly idempotent mutation on a network failure', async () => {
    const { api, http } = harness([new Error('reset'), ok({})]);

    await api.request('DELETE', 'payments/links/PL-1', { retry: 'idempotent' });
    expect(http.calls).toHaveLength(2);
  });

  it('keeps PayHub money calls single-shot end to end', async () => {
    const http = new FakeFetch([unavailable, ok({ payment: { public_id: 'p' } })]);
    const client = new PayHub({ apiKey: 'k_id:s_secret', country: 'bf', fetch: http.fn });

    await expect(
      client.payments.create({
        operator: 'ORANGE',
        phone_number: '70123456',
        amount: 100,
        order: { id: 'O-1' },
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableError);
    expect(http.calls).toHaveLength(1);
  });
});

describe('redirects', () => {
  it('asks the transport never to follow redirects', async () => {
    const { api, http } = harness([ok({})]);

    await api.request('GET', 'ping');
    expect(http.lastCall?.init.redirect).toBe('manual');
  });

  it.each([301, 302, 307, 308])(
    'treats HTTP %i as an error and stops',
    async (status) => {
      const { api, http } = harness([
        textResponse(status, '', { location: 'https://evil.example/steal' }),
        ok({}),
      ]);

      const error = await api.request('GET', 'ping').catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).httpStatus).toBe(status);
      expect((error as ApiError).message).toContain('redirect');
      expect(http.calls).toHaveLength(1);
    },
  );
});

describe('timeouts', () => {
  it('aborts the request through the signal and reports a timeout', async () => {
    const { api, http } = harness([hang], { timeoutMs: 20, maxRetries: 0 });

    const error = await api.request('GET', 'ping').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NetworkError);
    expect((error as NetworkError).timedOut).toBe(true);
    expect((error as NetworkError).message).toContain('timed out after 20 ms');
    expect(http.lastCall?.init.signal?.aborted).toBe(true);
  });

  it('still gives up on a transport that ignores the abort signal', async () => {
    const deaf: Reply = () => new Promise(() => undefined);
    const { api } = harness([deaf], { timeoutMs: 20, maxRetries: 0 });

    const error = await api.request('GET', 'ping').catch((e: unknown) => e);
    expect((error as NetworkError).timedOut).toBe(true);
  });

  it('covers the body read, not just the headers', async () => {
    const stalledBody: Reply = (_url, init) =>
      Promise.resolve({
        status: 200,
        text: () =>
          new Promise<string>((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
          }),
      });
    const { api } = harness([stalledBody], { timeoutMs: 20, maxRetries: 0 });

    const error = await api.request('GET', 'ping').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NetworkError);
    expect((error as NetworkError).timedOut).toBe(true);
  });

  it('wraps a failed body read as NetworkError', async () => {
    const broken: Reply = () =>
      Promise.resolve({
        status: 200,
        text: () => Promise.reject(new Error('terminated')),
      });
    const { api } = harness([broken], { maxRetries: 0 });

    const error = await api.request('GET', 'ping').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NetworkError);
    expect((error as NetworkError).timedOut).toBe(false);
    expect((error as NetworkError).message).toContain('terminated');
  });

  it('surfaces the system error code of a failed fetch', async () => {
    const failure = new TypeError('fetch failed', {
      cause: Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }),
    });
    const { api } = harness([failure], { maxRetries: 0 });

    const error = (await api
      .request('GET', 'ping')
      .catch((e: unknown) => e)) as NetworkError;
    expect(error.message).toBe(
      'The GET request failed to complete: fetch failed (ECONNREFUSED).',
    );
    expect(error.cause).toBe(failure);
  });
});

describe('responses', () => {
  it('maps a non-JSON error page by its status', async () => {
    const { api } = harness([textResponse(404, '<html>Not Found</html>')]);

    const error = (await api
      .request('GET', 'payments/x')
      .catch((e: unknown) => e)) as ApiError;
    expect(error).toBeInstanceOf(NotFoundError);
    expect(error.message).toBe('barkapay API error (HTTP 404).');
    expect(error.code).toBe('');
  });

  it('refuses a 2xx whose body is not a JSON object', async () => {
    const { api } = harness([textResponse(200, '<html>challenge</html>')]);

    const error = (await api.request('GET', 'ping').catch((e: unknown) => e)) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.httpStatus).toBe(200);
  });

  it('accepts an empty 2xx body', async () => {
    const { api } = harness([textResponse(200, '')]);

    await expect(api.request('POST', 'payments/p/resend-otp')).resolves.toEqual({});
  });

  it('treats an error envelope as an error even on HTTP 200', async () => {
    const { api } = harness([
      jsonResponse(200, { status: 'failed', code: 'validation_error', message: 'nope' }),
    ]);

    await expect(api.request('GET', 'ping')).rejects.toMatchObject({
      code: 'validation_error',
    });
  });

  it('takes the request id from the envelope, then the header, then the one it sent', async () => {
    const fromEnvelope = harness([
      jsonResponse(
        404,
        {
          status: 'failed',
          code: 'resource_not_found',
          message: 'x',
          request_id: 'env-id',
        },
        { 'X-Request-Id': 'header-id' },
      ),
    ]);
    await expect(fromEnvelope.api.request('GET', 'x')).rejects.toMatchObject({
      requestId: 'env-id',
    });

    const fromHeader = harness(
      [textResponse(502, 'Bad gateway', { 'X-Request-Id': 'header-id' })],
      {
        maxRetries: 0,
      },
    );
    await expect(fromHeader.api.request('GET', 'x')).rejects.toMatchObject({
      requestId: 'header-id',
    });

    const sent = harness([textResponse(502, 'Bad gateway')], { maxRetries: 0 });
    const error = (await sent.api
      .request('GET', 'x')
      .catch((e: unknown) => e)) as ApiError;
    expect(error.requestId).toBe(sent.http.lastCall?.init.headers['X-Request-Id']);
    expect(error.requestId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('exposes Retry-After on the error', async () => {
    const { api } = harness([throttled('12')], { maxRetries: 0 });

    await expect(api.request('GET', 'payments')).rejects.toMatchObject({
      retryAfter: 12,
    });
  });

  it('reads headers from a plain-object transport too', async () => {
    const plain: Reply = () =>
      Promise.resolve({
        status: 429,
        headers: { 'Retry-After': '5' } as never,
        text: () => Promise.resolve('{}'),
      });
    const { api } = harness([plain], { maxRetries: 0 });

    await expect(api.request('GET', 'payments')).rejects.toMatchObject({ retryAfter: 5 });
  });
});

describe('request building', () => {
  it('serialises the query string: drops null/undefined, booleans as 1/0', async () => {
    const { api, http } = harness([ok({})]);

    await api.request('GET', 'payments', {
      query: {
        status: 'FAILED',
        per_page: 10,
        a: null,
        b: undefined,
        yes: true,
        no: false,
      },
    });
    expect(http.lastCall?.url).toBe(
      'https://hub.barkapay.com/bf/v1/payments?status=FAILED&per_page=10&yes=1&no=0',
    );
  });

  it('percent-encodes query values', async () => {
    const { api, http } = harness([ok({})]);

    await api.request('GET', 'payments', { query: { order_id: 'A&B=C #1/é' } });
    expect(http.lastCall?.url).toBe(
      'https://hub.barkapay.com/bf/v1/payments?order_id=A%26B%3DC+%231%2F%C3%A9',
    );
  });

  it('sends no body and no Content-Type on a body-less POST', async () => {
    const { api, http } = harness([ok({})]);

    await api.request('POST', 'payments/p/resend-otp');
    expect(http.lastCall?.init.body).toBeUndefined();
    expect(http.lastCall?.init.headers['Content-Type']).toBeUndefined();
  });

  it('sends the same request id on every attempt of one call', async () => {
    const { api, http } = harness([unavailable, ok({})]);

    await api.request('GET', 'ping');
    expect(http.calls[0]?.init.headers['X-Request-Id']).toBe(
      http.calls[1]?.init.headers['X-Request-Id'],
    );
  });

  it('rejects a body that cannot be serialised', async () => {
    const { api, http } = harness([ok({})]);
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;

    await expect(api.request('POST', 'payments', { body: cyclic })).rejects.toThrow(
      'cannot be serialised',
    );
    expect(http.calls).toHaveLength(0);
  });
});

describe('parseRetryAfter', () => {
  it('reads delta-seconds', () => {
    expect(parseRetryAfter('30')).toBe(30);
    expect(parseRetryAfter(' 0 ')).toBe(0);
  });

  it('reads an HTTP date', () => {
    const inTenSeconds = new Date(Date.now() + 10_000).toUTCString();
    const parsed = parseRetryAfter(inTenSeconds);
    expect(parsed).toBeGreaterThanOrEqual(9);
    expect(parsed).toBeLessThanOrEqual(11);
    expect(parseRetryAfter(new Date(Date.now() - 60_000).toUTCString())).toBe(0);
  });

  it('ignores garbage', () => {
    expect(parseRetryAfter(null)).toBeNull();
    expect(parseRetryAfter('')).toBeNull();
    expect(parseRetryAfter('soon')).toBeNull();
    expect(parseRetryAfter('-5')).toBeNull();
    expect(parseRetryAfter('1.5')).toBeNull();
  });
});
