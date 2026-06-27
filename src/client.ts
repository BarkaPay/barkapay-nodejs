import { ApiClient } from './apiClient';
import { ConfigurationError } from './errors';
import type { FetchFn } from './http';
import { BalanceResource } from './resources/balance';
import { Operators } from './resources/operators';
import { Payments } from './resources/payments';
import { Transfers } from './resources/transfers';
import { coerceObject } from './util';
import { VERSION } from './version';

export interface PayHubOptions {
  /**
   * The merchant key as `"key_id:secret"` (what you copy from the dashboard).
   * Do NOT prefix it with `Bearer` — the SDK does that. An accidental `Bearer `
   * prefix is forgiven.
   */
  apiKey?: string;
  /** Alternatively, the key id… */
  keyId?: string;
  /** …and the secret, passed separately. */
  secret?: string;
  /** Default country code (e.g. `"bf"`); overridable per call. */
  country?: string;
  /** API base URL. */
  baseUrl?: string;
  /** Automatic retries on 429/503/network errors (default 2). */
  maxRetries?: number;
  /** Per-request timeout in milliseconds (default 30000). */
  timeoutMs?: number;
  /** A `fetch`-compatible function; defaults to the global `fetch` (Node 18+). */
  fetch?: FetchFn;
}

/**
 * Entry point to the PayHub API.
 *
 * ```ts
 * const payhub = new PayHub({ apiKey: 'pk_live_xxx:sk_live_yyy', country: 'bf' });
 * const payment = await payhub.payments.create({
 *   operator: 'ORANGE',
 *   phone_number: '50123456789',
 *   amount: 10000,
 *   otp: '123456',
 *   order: { id: 'ORDER-2026-001' },
 * });
 * ```
 */
export class PayHub {
  static readonly VERSION = VERSION;

  readonly payments: Payments;
  readonly transfers: Transfers;
  readonly balance: BalanceResource;
  readonly operators: Operators;

  private readonly api: ApiClient;

  constructor(options: PayHubOptions) {
    const fetchFn = options.fetch ?? (globalThis.fetch as FetchFn | undefined);
    if (!fetchFn) {
      throw new ConfigurationError(
        'No global `fetch` available. Use Node 18+ or pass a `fetch` implementation.',
      );
    }

    this.api = new ApiClient({
      fetchFn,
      authorization: buildAuthorization(options),
      baseUrl: (options.baseUrl ?? 'https://hub.barkapay.com').replace(/\/+$/, ''),
      defaultCountry: (options.country ?? '').trim().toLowerCase(),
      maxRetries: Math.max(0, options.maxRetries ?? 2),
      timeoutMs: options.timeoutMs ?? 30000,
      userAgent: `payhub-node/${VERSION}`,
    });

    this.payments = new Payments(this.api);
    this.transfers = new Transfers(this.api);
    this.balance = new BalanceResource(this.api);
    this.operators = new Operators(this.api);
  }

  /** Liveness check (also confirms your key works). */
  async ping(country?: string): Promise<Record<string, unknown>> {
    const env = await this.api.request('GET', 'ping', { country });
    return coerceObject(env, 'data') ?? {};
  }

  /** Current merchant + API application details. */
  async me(country?: string): Promise<Record<string, unknown>> {
    const env = await this.api.request('GET', 'me', { country });
    return coerceObject(env, 'data') ?? {};
  }
}

function buildAuthorization(options: PayHubOptions): string {
  if (options.apiKey && options.apiKey.trim() !== '') {
    let token = options.apiKey.trim();
    // Forgive an accidental "Bearer " prefix so we never send "Bearer Bearer …".
    if (/^bearer\s+/i.test(token)) {
      token = token.replace(/^bearer\s+/i, '').trim();
    }
    return `Bearer ${token}`;
  }

  if (
    options.keyId &&
    options.secret &&
    options.keyId.trim() !== '' &&
    options.secret.trim() !== ''
  ) {
    return `Bearer ${options.keyId.trim()}:${options.secret.trim()}`;
  }

  throw new ConfigurationError(
    'Provide `apiKey` ("key_id:secret") or both `keyId` and `secret`.',
  );
}
