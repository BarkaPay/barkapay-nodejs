import { randomUUID } from 'node:crypto';

import { ApiError, ConfigurationError, NetworkError } from './errors';
import type { FetchFn, PayHubRequestInit, PayHubResponse } from './http';
import { normalizeCountry } from './path';
import { decodeEnvelope, isRecord } from './util';

const BASE_DELAY_MS = 500;
const MAX_DELAY_MS = 8_000;
/**
 * A `Retry-After` longer than this is handed back to the caller (as a
 * `RateLimitError` carrying `retryAfter`) instead of slept on. The API asks
 * for 10 s on a real 429; money is never sent from a call that has been
 * asleep for longer.
 */
const MAX_RETRY_AFTER_SECONDS = 10;
/** Response headers kept on every error (lower-cased names). */
const KEPT_HEADERS = [
  'retry-after',
  'x-request-id',
  'x-ratelimit-limit',
  'x-ratelimit-remaining',
] as const;
const REDACTED = '[redacted]';

/**
 * When may a request be sent again automatically?
 *
 * - `idempotent`: a read (GET/HEAD). Retried on network failures, timeouts
 *   and 429 / 502 / 503 / 504.
 * - `rate-limit-only`: every write (POST/PATCH/DELETE: create a payment, a
 *   transfer or a link, confirm or resend an OTP, update / cancel / pause /
 *   resume a link). Retried ONLY on 429, the one answer that proves the API
 *   refused it before doing any work, and only when the wait it asks for is
 *   at most 10 s. A timeout, a network error or a 5xx leaves the outcome
 *   unknown, and the API has no idempotency-key header: replaying could
 *   charge or pay twice.
 */
export type RetryMode = 'idempotent' | 'rate-limit-only';

export interface ApiClientOptions {
  fetchFn: FetchFn;
  /** The complete `Authorization` header value (`Bearer key_id:secret`). */
  authorization: string;
  baseUrl: string;
  defaultCountry: string;
  maxRetries: number;
  timeoutMs: number;
  userAgent: string;
  /** Test seams — default to a real timer and `Math.random`. */
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

export interface RequestOptions {
  country?: string | null;
  body?: object | null;
  query?: Record<string, unknown> | null;
  /** Defaults to `idempotent` for GET/HEAD and `rate-limit-only` otherwise. */
  retry?: RetryMode;
  /** Accept a 2xx with an empty body (endpoints that return nothing useful). */
  allowEmpty?: boolean;
}

interface RawResponse {
  status: number;
  text: string;
  retryAfter: number | null;
  requestId: string | null;
  headers: Record<string, string>;
}

/** Internal marker for a request that produced no usable response. */
class TransportFailure extends Error {
  constructor(
    readonly reason: unknown,
    readonly timedOut: boolean,
  ) {
    super('transport failure');
  }
}

/**
 * Internal transport: turns a logical call (method, path, country, body) into
 * an authenticated HTTP request against `https://hub.barkapay.com/{country}/v1/…`,
 * retries what is safe to retry, and unwraps the standard response envelope
 * (throwing a typed {@link ApiError} on error).
 *
 * Credentials live in private fields: they never show up in `console.log`,
 * `util.inspect` or `JSON.stringify` output, nor in the errors the SDK throws.
 *
 * @internal
 */
export class ApiClient {
  readonly #fetchFn: FetchFn;
  readonly #authorization: string;
  readonly #secrets: readonly string[];
  readonly #baseUrl: string;
  readonly #defaultCountry: string;
  readonly #maxRetries: number;
  readonly #timeoutMs: number;
  readonly #userAgent: string;
  readonly #sleep: (ms: number) => Promise<void>;
  readonly #random: () => number;

  constructor(options: ApiClientOptions) {
    this.#fetchFn = options.fetchFn;
    this.#authorization = options.authorization;
    this.#secrets = secretsOf(options.authorization);
    this.#baseUrl = options.baseUrl;
    this.#defaultCountry = options.defaultCountry;
    this.#maxRetries = options.maxRetries;
    this.#timeoutMs = options.timeoutMs;
    this.#userAgent = options.userAgent;
    this.#sleep = options.sleep ?? defaultSleep;
    this.#random = options.random ?? Math.random;
  }

  get baseUrl(): string {
    return this.#baseUrl;
  }

  get defaultCountry(): string {
    return this.#defaultCountry;
  }

  async request(
    method: string,
    path: string,
    { country, body, query, retry, allowEmpty = false }: RequestOptions = {},
  ): Promise<Record<string, unknown>> {
    const cc =
      country === undefined || country === null || country === ''
        ? this.#defaultCountry
        : normalizeCountry(country);
    if (cc === '') {
      throw new ConfigurationError(
        'No country given for this call and no default set on the client.',
      );
    }

    let url = `${this.#baseUrl}/${cc}/v1/${path.replace(/^\/+/, '')}`;
    const qs = buildQuery(query);
    if (qs !== '') {
      url += `?${qs}`;
    }

    const requestId = randomUUID();
    const headers: Record<string, string> = {
      Authorization: this.#authorization,
      Accept: 'application/json',
      'User-Agent': this.#userAgent,
      'X-Request-Id': requestId,
    };

    let payload: string | undefined;
    if (body !== undefined && body !== null) {
      try {
        payload = JSON.stringify(body);
      } catch {
        throw new ConfigurationError('The request body cannot be serialised to JSON.');
      }
      headers['Content-Type'] = 'application/json';
    }

    const mode: RetryMode =
      retry ?? (method === 'GET' || method === 'HEAD' ? 'idempotent' : 'rate-limit-only');

    for (let attempt = 0; ; attempt++) {
      const mayRetry = attempt < this.#maxRetries;

      let response: RawResponse;
      try {
        response = await this.#send(url, method, headers, payload);
      } catch (failure) {
        if (!(failure instanceof TransportFailure)) {
          throw failure;
        }
        if (mayRetry && mode === 'idempotent') {
          await this.#sleep(backoffMs(attempt, this.#random));
          continue;
        }
        throw this.#networkError(failure, method, mode, requestId);
      }

      if (mayRetry && isRetryableStatus(response.status, mode)) {
        const delay = retryDelayMs(attempt, response.retryAfter, this.#random);
        if (delay !== null) {
          await this.#sleep(delay);
          continue;
        }
      }

      return handle(response, requestId, allowEmpty);
    }
  }

  /** One HTTP exchange, bounded by `timeoutMs` from the first byte sent to the last byte read. */
  async #send(
    url: string,
    method: string,
    headers: Record<string, string>,
    payload: string | undefined,
  ): Promise<RawResponse> {
    const controller = new AbortController();
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
        reject(new TransportFailure(undefined, true));
      }, this.#timeoutMs);
    });

    const init: PayHubRequestInit = {
      method,
      headers: { ...headers },
      signal: controller.signal,
      // Never follow a redirect: the Authorization header must not travel to
      // whatever URL a 3xx points at.
      redirect: 'manual',
    };
    if (payload !== undefined) {
      init.body = payload;
    }

    // Called unbound, like the global `fetch` expects (some runtimes reject a
    // foreign `this` with "Illegal invocation").
    const fetchFn = this.#fetchFn;
    const exchange = (async (): Promise<RawResponse> => {
      const response = await fetchFn(url, init);
      const text = await response.text();
      const kept: Record<string, string> = {};
      for (const name of KEPT_HEADERS) {
        const value = readHeader(response, name);
        if (value !== null) {
          kept[name] = value;
        }
      }
      return {
        status: response.status,
        text,
        retryAfter: parseRetryAfter(kept['retry-after'] ?? null),
        requestId: kept['x-request-id'] ?? null,
        headers: kept,
      };
    })();
    // If the deadline wins the race, the exchange rejects later (abort): mark
    // that rejection as handled.
    exchange.catch(() => undefined);

    try {
      return await Promise.race([exchange, deadline]);
    } catch (reason) {
      if (reason instanceof TransportFailure) {
        throw reason;
      }
      throw new TransportFailure(reason, timedOut);
    } finally {
      clearTimeout(timer);
    }
  }

  #networkError(
    failure: TransportFailure,
    method: string,
    mode: RetryMode,
    requestId: string,
  ): NetworkError {
    // A request that is not idempotent may have been processed even though no
    // response came back: say so, the caller must not blindly send it again.
    const hint =
      mode === 'idempotent'
        ? ''
        : ' The API may still have processed it: check before sending it again.';

    if (failure.timedOut) {
      return new NetworkError(
        `The ${method} request timed out after ${this.#timeoutMs} ms.${hint}`,
        { timedOut: true, requestId },
      );
    }

    const reason = failure.reason;
    const detail = this.#redact(describe(reason));
    const message =
      detail === ''
        ? `The ${method} request failed to complete.${hint}`
        : `The ${method} request failed to complete: ${detail}.${hint}`;

    // Keep the original error as `cause` for debugging — unless it quotes the
    // credentials, in which case it is dropped rather than leaked.
    return new NetworkError(
      message,
      this.#isClean(reason) ? { cause: reason, requestId } : { requestId },
    );
  }

  #redact(text: string): string {
    let out = text;
    for (const secret of this.#secrets) {
      out = out.split(secret).join(REDACTED);
    }
    return out;
  }

  #isClean(reason: unknown): boolean {
    let haystack: string;
    try {
      haystack =
        reason instanceof Error
          ? `${reason.message}\n${reason.stack ?? ''}\n${describe(reason.cause)}`
          : String(reason);
    } catch {
      return false;
    }
    return this.#secrets.every((secret) => !haystack.includes(secret));
  }

  /** Safe summary for `JSON.stringify` — never includes the credentials. */
  toJSON(): Record<string, unknown> {
    return {
      baseUrl: this.#baseUrl,
      country: this.#defaultCountry === '' ? null : this.#defaultCountry,
      credentials: REDACTED,
    };
  }

  /** Safe summary for `console.log` / `util.inspect`. */
  [Symbol.for('nodejs.util.inspect.custom')](): string {
    return `ApiClient ${JSON.stringify(this.toJSON())}`;
  }
}

function handle(
  response: RawResponse,
  sentRequestId: string,
  allowEmpty: boolean,
): Record<string, unknown> {
  const { status, text, retryAfter, headers } = response;
  const requestId = response.requestId ?? sentRequestId;

  if (status >= 300 && status < 400) {
    throw new ApiError(
      `Unexpected redirect (HTTP ${status}). The SDK never follows redirects — check the base URL.`,
      { httpStatus: status, requestId, headers },
    );
  }

  const envelope = decodeEnvelope(text);
  const envStatus = envelope?.status;

  if (status < 200 || status >= 400 || envStatus === 'error' || envStatus === 'failed') {
    throw ApiError.fromEnvelope(status, envelope ?? {}, requestId, retryAfter, headers);
  }

  if (envelope === null) {
    if (allowEmpty && text.trim() === '') {
      return {};
    }
    // A 2xx whose body is not the JSON envelope (empty, HTML from a proxy,
    // truncated) is not an answer: never hand back an empty object as a
    // success. The request WAS accepted, though — after a create call the
    // outcome is unknown, not refused.
    throw new ApiError(
      `Unexpected response (HTTP ${status}): the body is not a JSON object. ` +
        'The request was accepted: after a create call, look it up by your order id before sending it again.',
      { code: 'invalid_response', httpStatus: status, requestId, headers },
    );
  }

  return envelope;
}

function isRetryableStatus(status: number, mode: RetryMode): boolean {
  if (status === 429) {
    return true;
  }
  if (mode !== 'idempotent') {
    return false;
  }
  return status === 502 || status === 503 || status === 504;
}

/** Exponential backoff with jitter: between 50 % and 100 % of `BASE × 2^attempt`, capped. */
function backoffMs(attempt: number, random: () => number): number {
  const ceiling = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** attempt);
  return Math.round(ceiling / 2 + random() * (ceiling / 2));
}

/**
 * Delay before the next attempt, or `null` when the server asks for a wait so
 * long that the caller should decide (the error then carries `retryAfter`).
 */
function retryDelayMs(
  attempt: number,
  retryAfter: number | null,
  random: () => number,
): number | null {
  if (retryAfter === null) {
    return backoffMs(attempt, random);
  }
  if (retryAfter > MAX_RETRY_AFTER_SECONDS) {
    return null;
  }
  // Never earlier than the server asked; a little jitter avoids a thundering herd.
  return Math.round(retryAfter * 1000 + random() * 250);
}

/** `Retry-After` as seconds — accepts delta-seconds or an HTTP date. */
export function parseRetryAfter(value: string | null): number | null {
  if (value === null) {
    return null;
  }
  const trimmed = value.trim();
  if (/^\d{1,9}$/.test(trimmed)) {
    return Number.parseInt(trimmed, 10);
  }
  if (trimmed === '' || !/[a-z]/i.test(trimmed)) {
    return null;
  }
  const at = Date.parse(trimmed);
  if (Number.isNaN(at)) {
    return null;
  }
  return Math.max(0, Math.ceil((at - Date.now()) / 1000));
}

function readHeader(response: PayHubResponse, name: string): string | null {
  const headers: unknown = response.headers;
  try {
    if (typeof headers === 'object' && headers !== null) {
      const getter = (headers as { get?: unknown }).get;
      if (typeof getter === 'function') {
        const value: unknown = getter.call(headers, name);
        return typeof value === 'string' && value !== '' ? value : null;
      }
      if (isRecord(headers)) {
        for (const [key, value] of Object.entries(headers)) {
          if (key.toLowerCase() === name && typeof value === 'string' && value !== '') {
            return value;
          }
        }
      }
    }
  } catch {
    // A transport with an exotic headers object must not break the call.
  }
  return null;
}

function buildQuery(query: Record<string, unknown> | null | undefined): string {
  if (!query) {
    return '';
  }
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === null || value === undefined) {
      continue;
    }
    if (typeof value === 'boolean') {
      // The API's boolean validator accepts 1/0, not the words true/false.
      search.append(key, value ? '1' : '0');
    } else if (value instanceof Date) {
      search.append(key, value.toISOString());
    } else {
      search.append(key, String(value));
    }
  }
  return search.toString();
}

/** Short, human-readable description of a transport error (message + system code). */
function describe(reason: unknown): string {
  if (reason === undefined || reason === null) {
    return '';
  }
  if (!(reason instanceof Error)) {
    return typeof reason === 'string' ? reason : '';
  }
  const inner: unknown = reason.cause;
  const code =
    isRecord(inner) || inner instanceof Error
      ? (inner as { code?: unknown }).code
      : (reason as { code?: unknown }).code;
  return typeof code === 'string' && code !== '' && !reason.message.includes(code)
    ? `${reason.message} (${code})`
    : reason.message;
}

/** Every substring that must never appear in an error: the token and its secret part. */
function secretsOf(authorization: string): string[] {
  const token = authorization.replace(/^bearer\s+/i, '');
  const parts = [token];
  const colon = token.indexOf(':');
  if (colon !== -1) {
    parts.push(token.slice(colon + 1));
  }
  return parts.filter((part) => part.length >= 6);
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
