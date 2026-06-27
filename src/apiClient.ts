import { randomUUID } from 'node:crypto';

import { ApiError, ConfigurationError, NetworkError } from './errors';
import type { FetchFn, PayHubRequestInit } from './http';
import { decodeEnvelope } from './util';

const BASE_DELAY_MS = 300;

export interface ApiClientOptions {
  fetchFn: FetchFn;
  authorization: string;
  baseUrl: string;
  defaultCountry: string;
  maxRetries: number;
  timeoutMs: number;
  userAgent: string;
}

export interface RequestOptions {
  country?: string | null;
  body?: Record<string, unknown> | null;
  query?: Record<string, unknown> | null;
}

/**
 * Internal transport: turns a logical call (method, path, country, body) into a
 * signed HTTP request against `https://hub.barkapay.com/{country}/v1/…`, retries
 * transient failures, and unwraps the standard response envelope (throwing a
 * typed {@link ApiError} on error).
 *
 * @internal
 */
export class ApiClient {
  constructor(private readonly options: ApiClientOptions) {}

  async request(
    method: string,
    path: string,
    { country, body, query }: RequestOptions = {},
  ): Promise<Record<string, unknown>> {
    const cc = (country ?? this.options.defaultCountry).toLowerCase();
    if (cc === '') {
      throw new ConfigurationError(
        'No country given for this call and no default set on the client.',
      );
    }

    let url = `${this.options.baseUrl}/${encodeURIComponent(cc)}/v1/${path.replace(/^\/+/, '')}`;
    if (query) {
      const search = new URLSearchParams();
      for (const [key, value] of Object.entries(query)) {
        if (value !== null && value !== undefined) {
          search.append(key, String(value));
        }
      }
      const qs = search.toString();
      if (qs !== '') {
        url += `?${qs}`;
      }
    }

    const requestId = randomUUID();
    const headers: Record<string, string> = {
      Authorization: this.options.authorization,
      Accept: 'application/json',
      'User-Agent': this.options.userAgent,
      'X-Request-Id': requestId,
    };

    const init: PayHubRequestInit = { method, headers };
    if (body) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }

    let attempt = 0;
    for (;;) {
      let response;
      try {
        init.signal = AbortSignal.timeout(this.options.timeoutMs);
        response = await this.options.fetchFn(url, init);
      } catch (cause) {
        if (attempt < this.options.maxRetries) {
          await this.backoff(attempt++);
          continue;
        }
        throw new NetworkError(
          cause instanceof Error ? cause.message : 'The HTTP request failed to complete.',
        );
      }

      if (shouldRetry(response.status) && attempt < this.options.maxRetries) {
        await this.backoff(attempt++);
        continue;
      }

      return this.handle(response.status, await response.text(), requestId);
    }
  }

  private handle(
    status: number,
    rawBody: string,
    requestId: string,
  ): Record<string, unknown> {
    const envelope = decodeEnvelope(rawBody) ?? {};
    const envStatus = envelope.status;

    if (status >= 400 || envStatus === 'error' || envStatus === 'failed') {
      throw ApiError.fromEnvelope(status, envelope, requestId);
    }

    return envelope;
  }

  private backoff(attempt: number): Promise<void> {
    const delay = BASE_DELAY_MS * 2 ** attempt;
    return new Promise((resolve) => setTimeout(resolve, delay));
  }
}

function shouldRetry(status: number): boolean {
  return status === 429 || status === 503;
}
