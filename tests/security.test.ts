import { inspect } from 'node:util';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiClient } from '../src/apiClient';
import { ConfigurationError, NetworkError, PayHub } from '../src/index';
import { FakeFetch, ok, type Reply } from './fakeFetch';

const KEY_ID = 'pk_live_3f9a1c2b';
const SECRET = 'sk_live_not-a-real-secret_0123';
const API_KEY = `${KEY_ID}:${SECRET}`;

function client(replies: Reply[] = [], options: Record<string, unknown> = {}) {
  const http = new FakeFetch(replies);
  const payhub = new PayHub({
    apiKey: API_KEY,
    country: 'bf',
    maxRetries: 0,
    fetch: http.fn,
    ...options,
  });
  return { payhub, http };
}

describe('the API key never leaks', () => {
  it('is absent from util.inspect, even with hidden properties and full depth', () => {
    const { payhub } = client();

    for (const target of [
      payhub,
      payhub.payments,
      payhub.paymentLinks,
      payhub.transfers,
    ]) {
      const dump = inspect(target, { depth: Infinity, showHidden: true, getters: true });
      expect(dump).not.toContain(SECRET);
      expect(dump).not.toContain(KEY_ID);
      expect(dump).not.toContain('Bearer');
    }
  });

  it('is absent even when custom inspection is switched off', () => {
    const { payhub } = client();

    const dump = inspect(payhub, {
      depth: Infinity,
      showHidden: true,
      customInspect: false,
    });
    expect(dump).toContain('payments');
    expect(dump).not.toContain(SECRET);
    expect(dump).not.toContain(KEY_ID);
  });

  it('is held in private fields, down to the internal transport', () => {
    const api = new ApiClient({
      fetchFn: new FakeFetch([]).fn,
      authorization: `Bearer ${API_KEY}`,
      baseUrl: 'https://hub.barkapay.com',
      defaultCountry: 'bf',
      maxRetries: 0,
      timeoutMs: 1000,
      userAgent: 'test',
    });

    // No own property at all: nothing for a serializer or a debugger dump to pick up.
    expect(Reflect.ownKeys(api)).toEqual([]);
    const dump = inspect(api, {
      depth: Infinity,
      showHidden: true,
      customInspect: false,
    });
    expect(dump).not.toContain(SECRET);
    expect(dump).not.toContain('Bearer');
    expect(JSON.stringify(api)).not.toContain(SECRET);

    const { payhub } = client();
    for (const resource of [
      payhub.payments,
      payhub.paymentLinks,
      payhub.transfers,
      payhub.balance,
      payhub.operators,
    ]) {
      expect(Reflect.ownKeys(resource)).toEqual([]);
    }
  });

  it('is absent from console.log-style string conversions', () => {
    const { payhub } = client();

    expect(`${inspect(payhub)}`).toBe(
      'PayHub {"sdk":"barkapay-payhub","version":"1.1.0","baseUrl":"https://hub.barkapay.com","country":"bf","credentials":"[redacted]"}',
    );
    expect(String(payhub)).not.toContain(SECRET);
  });

  it('is absent from JSON.stringify', () => {
    const { payhub } = client();

    const json = JSON.stringify({ payhub, nested: { resource: payhub.payments } });
    expect(json).not.toContain(SECRET);
    expect(json).not.toContain(KEY_ID);
    expect(JSON.parse(json).payhub.credentials).toBe('[redacted]');
  });

  it('is not reachable through enumerable or own properties', () => {
    const { payhub } = client();
    const seen = new Set<unknown>();

    const walk = (value: unknown): void => {
      if (typeof value === 'string') {
        expect(value).not.toContain(SECRET);
        return;
      }
      if (typeof value !== 'object' || value === null || seen.has(value)) {
        return;
      }
      seen.add(value);
      for (const key of Reflect.ownKeys(value)) {
        walk((value as Record<PropertyKey, unknown>)[key]);
      }
    };

    walk(payhub);
  });

  it('is scrubbed from a transport error that quotes the Authorization header', async () => {
    const chatty = new TypeError(
      `Headers.append: "Bearer ${API_KEY}" is an invalid header value.`,
    );
    const { payhub } = client([chatty]);

    const error = (await payhub.ping().catch((e: unknown) => e)) as NetworkError;
    expect(error).toBeInstanceOf(NetworkError);
    expect(error.message).not.toContain(SECRET);
    expect(error.message).toContain('[redacted]');
    // The original error quotes the key: it must not ride along as `cause`.
    expect(error.cause).toBeUndefined();
    expect(inspect(error, { depth: Infinity })).not.toContain(SECRET);
  });

  it('is not echoed by configuration errors', () => {
    const attempt = () =>
      new PayHub({ apiKey: `${API_KEY}\nX-Injected: 1`, country: 'bf' });

    expect(attempt).toThrow(ConfigurationError);
    try {
      attempt();
    } catch (error) {
      expect(String((error as Error).message)).not.toContain(SECRET);
    }
  });

  it('is sent only in the Authorization header, never in the URL or the body', async () => {
    const { payhub, http } = client([ok({ payment: { public_id: 'p' } })]);

    await payhub.payments.create({
      operator: 'ORANGE',
      phone_number: '74123456',
      amount: 100,
      order: { id: 'O-1' },
    });
    const call = http.lastCall;
    expect(call?.init.headers.Authorization).toBe(`Bearer ${API_KEY}`);
    expect(call?.url).not.toContain(SECRET);
    expect(call?.init.body).not.toContain(SECRET);
  });
});

describe('credentials validation', () => {
  it.each([
    ['a line feed', `${API_KEY}\n`.padEnd(API_KEY.length + 5, 'x')],
    ['a carriage return', `${KEY_ID}\r\nX-Evil: 1:${SECRET}`],
    ['an inner space', `${KEY_ID}: ${SECRET}`],
    ['a non-ASCII character', `${KEY_ID}:${SECRET}é`],
    ['a NUL byte', `${KEY_ID}:${SECRET}\u0000`],
  ])('refuses a key with %s', (_label, apiKey) => {
    expect(() => new PayHub({ apiKey, country: 'bf' })).toThrow(ConfigurationError);
  });

  it('refuses missing credentials', () => {
    expect(() => new PayHub({ country: 'bf' })).toThrow(ConfigurationError);
    expect(() => new PayHub({ apiKey: '   ', country: 'bf' })).toThrow(
      ConfigurationError,
    );
    expect(() => new PayHub({ keyId: 'only-id', country: 'bf' })).toThrow(
      ConfigurationError,
    );
    expect(() => new PayHub(undefined as never)).toThrow(ConfigurationError);
  });
});

describe('path injection', () => {
  it.each([
    ['..'],
    ['.'],
    [''],
    ['   '],
    ['../../admin/payments'],
    ['a/b'],
    ['abc\u0000'],
    ['abc\r\nHost: evil'],
    ['x'.repeat(513)],
  ])('refuses the identifier %j before any request is made', async (id) => {
    const { payhub, http } = client([ok({ payments: [{ public_id: 'p' }] })]);

    await expect(payhub.payments.get(id)).rejects.toBeInstanceOf(ConfigurationError);
    await expect(payhub.transfers.get(id)).rejects.toBeInstanceOf(ConfigurationError);
    await expect(payhub.payments.confirmOtp(id, '123456')).rejects.toBeInstanceOf(
      ConfigurationError,
    );
    await expect(payhub.payments.resendOtp(id)).rejects.toBeInstanceOf(
      ConfigurationError,
    );
    await expect(payhub.paymentLinks.get(id)).rejects.toBeInstanceOf(ConfigurationError);
    await expect(payhub.paymentLinks.update(id, {})).rejects.toBeInstanceOf(
      ConfigurationError,
    );
    await expect(payhub.paymentLinks.cancel(id)).rejects.toBeInstanceOf(
      ConfigurationError,
    );
    await expect(payhub.paymentLinks.pause(id)).rejects.toBeInstanceOf(
      ConfigurationError,
    );
    await expect(payhub.paymentLinks.resume(id)).rejects.toBeInstanceOf(
      ConfigurationError,
    );
    await expect(payhub.paymentLinks.listPayments(id)).rejects.toBeInstanceOf(
      ConfigurationError,
    );
    expect(http.calls).toHaveLength(0);
  });

  it('refuses a non-string identifier', async () => {
    const { payhub, http } = client();

    await expect(payhub.payments.get(42 as never)).rejects.toBeInstanceOf(
      ConfigurationError,
    );
    await expect(payhub.payments.get(undefined as never)).rejects.toBeInstanceOf(
      ConfigurationError,
    );
    expect(http.calls).toHaveLength(0);
  });

  it('encodes a legitimate order id as a single path segment', async () => {
    const { payhub, http } = client([ok({ payments: [{ public_id: 'p' }] })]);

    await payhub.payments.get('CMD 2026 x=1&y=é%');
    expect(http.lastCall?.url).toBe(
      'https://hub.barkapay.com/bf/v1/payments/CMD%202026%20x%3D1%26y%3D%C3%A9%25',
    );
    // What the server will actually route: still exactly one segment after /payments/.
    expect(new URL(http.lastCall?.url ?? '').pathname.split('/')).toHaveLength(5);
  });

  it.each([['bf/../sn'], ['b'], ['bfa'], ['b f'], ['..'], ['b%2f'], ['bé'], ['1f']])(
    'refuses the country %j',
    async (country) => {
      const { payhub, http } = client([ok({})]);

      await expect(payhub.ping(country)).rejects.toBeInstanceOf(ConfigurationError);
      await expect(payhub.balance.get({ country })).rejects.toBeInstanceOf(
        ConfigurationError,
      );
      expect(() => new PayHub({ apiKey: API_KEY, country })).toThrow(ConfigurationError);
      expect(http.calls).toHaveLength(0);
    },
  );

  it('normalises the country case and surrounding spaces', async () => {
    const { payhub, http } = client([ok({}), ok({})], { country: ' BF ' });

    await payhub.ping();
    expect(http.lastCall?.url).toBe('https://hub.barkapay.com/bf/v1/ping');
    await payhub.ping('SN');
    expect(http.lastCall?.url).toBe('https://hub.barkapay.com/sn/v1/ping');
  });

  it('requires a country from the client or the call', async () => {
    const http = new FakeFetch([ok({})]);
    const payhub = new PayHub({ apiKey: API_KEY, fetch: http.fn });

    await expect(payhub.ping()).rejects.toThrow('No country given');
    expect(http.calls).toHaveLength(0);
  });
});

describe('baseUrl', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('defaults to the public hub', async () => {
    const { payhub, http } = client([ok({})]);

    await payhub.ping();
    expect(http.lastCall?.url).toBe('https://hub.barkapay.com/bf/v1/ping');
  });

  it('keeps a path prefix and trims trailing slashes', async () => {
    const { payhub, http } = client([ok({})], {
      baseUrl: 'https://proxy.example/hub///',
    });

    await payhub.ping();
    expect(http.lastCall?.url).toBe('https://proxy.example/hub/bf/v1/ping');
  });

  it.each([
    ['not a url'],
    ['ftp://hub.barkapay.com'],
    ['file:///etc/passwd'],
    ['https://user:pass@hub.barkapay.com'],
    ['https://hub.barkapay.com/?debug=1'],
    ['https://hub.barkapay.com/#frag'],
  ])('refuses %j', (baseUrl) => {
    expect(() => new PayHub({ apiKey: API_KEY, country: 'bf', baseUrl })).toThrow(
      ConfigurationError,
    );
  });

  it('accepts plain http for loopback hosts only, silently', () => {
    const warn = vi.spyOn(process, 'emitWarning').mockImplementation(() => undefined);

    new PayHub({ apiKey: API_KEY, country: 'bf', baseUrl: 'http://localhost:8080' });
    new PayHub({ apiKey: API_KEY, country: 'bf', baseUrl: 'http://127.0.0.1:8080' });
    new PayHub({ apiKey: API_KEY, country: 'bf', baseUrl: 'http://[::1]:8080' });
    expect(warn).not.toHaveBeenCalled();

    for (const baseUrl of [
      'http://mock.internal:8080',
      'http://10.0.0.5',
      'http://localhost.evil.example',
      'http://127.0.0.1.nip.io',
    ]) {
      expect(() => new PayHub({ apiKey: API_KEY, country: 'bf', baseUrl })).toThrow(
        ConfigurationError,
      );
    }
  });

  it('refuses plain http to a barkapay host, even with a custom fetch', () => {
    for (const baseUrl of [
      'http://hub.barkapay.com',
      'http://HUB.BARKAPAY.COM.',
      'http://barkapay.com',
    ]) {
      expect(
        () =>
          new PayHub({
            apiKey: API_KEY,
            country: 'bf',
            baseUrl,
            fetch: new FakeFetch([]).fn,
          }),
      ).toThrow(ConfigurationError);
    }
  });

  it('lets a custom fetch reach a plain-http mock, with one warning', () => {
    const warn = vi.spyOn(process, 'emitWarning').mockImplementation(() => undefined);
    const fetch = new FakeFetch([]).fn;

    new PayHub({
      apiKey: API_KEY,
      country: 'bf',
      baseUrl: 'http://mock.internal:8080',
      fetch,
    });
    new PayHub({
      apiKey: API_KEY,
      country: 'bf',
      baseUrl: 'http://mock.internal:8080',
      fetch,
    });
    expect(warn.mock.calls.length).toBeLessThanOrEqual(1);
  });

  it.each([['a?b'], ['a#b'], ['?'], ['#']])(
    'refuses an identifier containing ? or # (%j) before any request',
    async (id) => {
      const { payhub, http } = client([ok({ payments: [] })]);
      await expect(payhub.payments.get(id)).rejects.toBeInstanceOf(ConfigurationError);
      await expect(payhub.paymentLinks.cancel(id)).rejects.toBeInstanceOf(
        ConfigurationError,
      );
      expect(http.calls).toHaveLength(0);
    },
  );
});

describe('options validation', () => {
  it.each([[0], [-1], [Number.NaN], [Number.POSITIVE_INFINITY], ['30000']])(
    'refuses timeoutMs = %j',
    (timeoutMs) => {
      expect(
        () =>
          new PayHub({ apiKey: API_KEY, country: 'bf', timeoutMs: timeoutMs as number }),
      ).toThrow(ConfigurationError);
    },
  );

  it('refuses a NaN maxRetries and clamps the rest', () => {
    expect(
      () => new PayHub({ apiKey: API_KEY, country: 'bf', maxRetries: Number.NaN }),
    ).toThrow(ConfigurationError);
    expect(
      () => new PayHub({ apiKey: API_KEY, country: 'bf', maxRetries: -3 }),
    ).not.toThrow();
    expect(
      () => new PayHub({ apiKey: API_KEY, country: 'bf', maxRetries: 1e9 }),
    ).not.toThrow();
  });

  it('refuses wrongly typed options instead of crashing', async () => {
    expect(() => new PayHub({ apiKey: API_KEY, country: 42 as never })).toThrow(
      ConfigurationError,
    );
    expect(
      () => new PayHub({ apiKey: API_KEY, country: 'bf', baseUrl: 42 as never }),
    ).toThrow(ConfigurationError);
    expect(() => new PayHub({ apiKey: API_KEY, country: '  ' })).not.toThrow();

    const { payhub, http } = client();
    await expect(payhub.payments.create(null as never)).rejects.toBeInstanceOf(
      ConfigurationError,
    );
    expect(http.calls).toHaveLength(0);
  });

  it('refuses a non-function fetch', () => {
    expect(
      () => new PayHub({ apiKey: API_KEY, country: 'bf', fetch: 'fetch' as never }),
    ).toThrow(ConfigurationError);
  });
});
