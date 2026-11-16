import { ApiClient } from './apiClient';
import { ConfigurationError } from './errors';
import type { FetchFn } from './http';
import { normalizeCountry } from './path';
import { BalanceResource } from './resources/balance';
import { Operators } from './resources/operators';
import { PaymentLinks } from './resources/paymentLinks';
import { Payments } from './resources/payments';
import { Transfers } from './resources/transfers';
import type { MeResult, PingResult } from './types';
import { coerceObject } from './util';
import { VERSION } from './version';

const DEFAULT_BASE_URL = 'https://hub.barkapay.com';
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRIES = 2;
const MAX_RETRIES_CEILING = 10;

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
  /** Default country code (`"bf"`, `"bj"` or `"sn"`); overridable per call. */
  country?: string;
  /** API base URL (default `https://hub.barkapay.com`). Must be `https://` outside of local testing. */
  baseUrl?: string;
  /**
   * Automatic retries (default 2). Read-only and idempotent calls are retried
   * on network failures and 408/429/502/503/504; calls that create something
   * or move money are retried on 429 only. `0` disables retries.
   */
  maxRetries?: number;
  /** Per-attempt timeout in milliseconds, headers and body included (default 30000). */
  timeoutMs?: number;
  /** A `fetch`-compatible function; defaults to the global `fetch` (Node 18+). */
  fetch?: FetchFn;
}

/**
 * Entry point to the barkapay API.
 *
 * ```ts
 * const payhub = new PayHub({ apiKey: process.env.BARKAPAY_API_KEY, country: 'bf' });
 * const payment = await payhub.payments.create({
 *   operator: 'ORANGE',
 *   phone_number: '70123456',
 *   amount: 10000,
 *   otp: '123456',
 *   order: { id: 'ORDER-2026-001', unique: true },
 * });
 * ```
 */
export class PayHub {
  static readonly VERSION = VERSION;

  readonly payments: Payments;
  readonly paymentLinks: PaymentLinks;
  readonly transfers: Transfers;
  readonly balance: BalanceResource;
  readonly operators: Operators;

  readonly #api: ApiClient;

  constructor(options: PayHubOptions) {
    if (typeof options !== 'object' || options === null) {
      throw new ConfigurationError(
        'Pass an options object: new PayHub({ apiKey, country }).',
      );
    }

    const fetchFn = options.fetch ?? (globalThis.fetch as FetchFn | undefined);
    if (typeof fetchFn !== 'function') {
      throw new ConfigurationError(
        'No global `fetch` available. Use Node 18+ or pass a `fetch` implementation.',
      );
    }

    this.#api = new ApiClient({
      fetchFn,
      authorization: buildAuthorization(options),
      baseUrl: normalizeBaseUrl(options.baseUrl),
      defaultCountry: normalizeDefaultCountry(options.country),
      maxRetries: normalizeMaxRetries(options.maxRetries),
      timeoutMs: normalizeTimeout(options.timeoutMs),
      userAgent: buildUserAgent(),
    });

    this.payments = new Payments(this.#api);
    this.paymentLinks = new PaymentLinks(this.#api);
    this.transfers = new Transfers(this.#api);
    this.balance = new BalanceResource(this.#api);
    this.operators = new Operators(this.#api);
  }

  /** Liveness check (also confirms your key works). */
  async ping(country?: string): Promise<PingResult> {
    const env = await this.#api.request('GET', 'ping', { country });
    return coerceObject(env, 'data') ?? {};
  }

  /** Current merchant + API application details (scopes, operator permissions). */
  async me(country?: string): Promise<MeResult> {
    const env = await this.#api.request('GET', 'me', { country });
    return coerceObject(env, 'data') ?? {};
  }

  /** Safe summary for `JSON.stringify` — never includes the API key. */
  toJSON(): Record<string, unknown> {
    return { sdk: 'barkapay-payhub', version: VERSION, ...this.#api.toJSON() };
  }

  /** Safe summary for `console.log` / `util.inspect` — never includes the API key. */
  [Symbol.for('nodejs.util.inspect.custom')](): string {
    return `PayHub ${JSON.stringify(this.toJSON())}`;
  }
}

/**
 * Printable ASCII without spaces. Anything else cannot be a barkapay key, and
 * refusing it here keeps a stray newline from ever reaching the HTTP layer
 * (whose error would quote the header, key included).
 */
const CREDENTIAL_PATTERN = /^[\x21-\x7e]+$/;

function buildAuthorization(options: PayHubOptions): string {
  let token: string | null = null;

  if (typeof options.apiKey === 'string' && options.apiKey.trim() !== '') {
    token = options.apiKey.trim();
    // Forgive an accidental "Bearer " prefix so we never send "Bearer Bearer …".
    if (/^bearer\s+/i.test(token)) {
      token = token.replace(/^bearer\s+/i, '').trim();
    }
  } else if (
    typeof options.keyId === 'string' &&
    typeof options.secret === 'string' &&
    options.keyId.trim() !== '' &&
    options.secret.trim() !== ''
  ) {
    token = `${options.keyId.trim()}:${options.secret.trim()}`;
  }

  if (token === null || token === '') {
    throw new ConfigurationError(
      'Provide `apiKey` ("key_id:secret") or both `keyId` and `secret`.',
    );
  }
  if (!CREDENTIAL_PATTERN.test(token)) {
    // Deliberately does not echo the value.
    throw new ConfigurationError(
      'The API key contains whitespace or non-ASCII characters. Copy it again from the dashboard.',
    );
  }

  return `Bearer ${token}`;
}

/** No default country is fine (each call must then name one); a wrong one is not. */
function normalizeDefaultCountry(value: unknown): string {
  if (value === undefined || value === null) {
    return '';
  }
  if (typeof value === 'string' && value.trim() === '') {
    return '';
  }
  return normalizeCountry(value);
}

function normalizeBaseUrl(value: unknown): string {
  if (value === undefined || value === null) {
    return DEFAULT_BASE_URL;
  }
  if (typeof value !== 'string') {
    throw new ConfigurationError('`baseUrl` must be a string.');
  }
  if (value.trim() === '') {
    return DEFAULT_BASE_URL;
  }

  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new ConfigurationError(
      '`baseUrl` is not a valid URL (expected e.g. "https://hub.barkapay.com").',
    );
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new ConfigurationError('`baseUrl` must be an http(s) URL.');
  }
  if (url.username !== '' || url.password !== '') {
    throw new ConfigurationError('`baseUrl` must not embed credentials.');
  }
  if (url.search !== '' || url.hash !== '') {
    throw new ConfigurationError(
      '`baseUrl` must not carry a query string or a fragment.',
    );
  }
  if (url.protocol === 'http:' && !isLoopback(url.hostname)) {
    warnInsecureBaseUrl();
  }

  return `${url.origin}${url.pathname}`.replace(/\/+$/, '');
}

function isLoopback(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === '[::1]' ||
    /^127(\.\d{1,3}){3}$/.test(hostname)
  );
}

let insecureBaseUrlWarned = false;

function warnInsecureBaseUrl(): void {
  if (insecureBaseUrlWarned) {
    return;
  }
  insecureBaseUrlWarned = true;
  if (typeof process !== 'undefined' && typeof process.emitWarning === 'function') {
    process.emitWarning(
      'barkapay-payhub: `baseUrl` uses plain http — the API key will be sent unencrypted. Use https outside of local testing.',
      { code: 'BARKAPAY_INSECURE_BASE_URL' },
    );
  }
}

function normalizeMaxRetries(value: number | undefined): number {
  if (value === undefined) {
    return DEFAULT_MAX_RETRIES;
  }
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new ConfigurationError('`maxRetries` must be a number.');
  }
  return Math.min(MAX_RETRIES_CEILING, Math.max(0, Math.floor(value)));
}

function normalizeTimeout(value: number | undefined): number {
  if (value === undefined) {
    return DEFAULT_TIMEOUT_MS;
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new ConfigurationError(
      '`timeoutMs` must be a positive number of milliseconds.',
    );
  }
  return Math.ceil(value);
}

function buildUserAgent(): string {
  const node =
    typeof process !== 'undefined' && typeof process.versions?.node === 'string'
      ? ` node/${process.versions.node}`
      : '';
  return `barkapay-payhub-node/${VERSION}${node}`;
}
