import type { FetchFn, PayHubRequestInit, PayHubResponse } from '../src/http';

export interface RecordedCall {
  url: string;
  init: PayHubRequestInit;
}

/** A queued reply: a response, an error to throw, or a function that decides per call. */
export type Reply =
  | PayHubResponse
  | Error
  | ((url: string, init: PayHubRequestInit) => Promise<PayHubResponse>);

function headersOf(headers: Record<string, string>): {
  get(name: string): string | null;
} {
  const lower = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return { get: (name) => lower.get(name.toLowerCase()) ?? null };
}

/** Build a fake JSON response (no network). */
export function jsonResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): PayHubResponse {
  return textResponse(status, JSON.stringify(body), {
    'content-type': 'application/json',
    ...headers,
  });
}

/** Build a fake response with an arbitrary body (HTML error page, empty body…). */
export function textResponse(
  status: number,
  text: string,
  headers: Record<string, string> = {},
): PayHubResponse {
  return { status, headers: headersOf(headers), text: () => Promise.resolve(text) };
}

/** A success envelope, as the API wraps every 2xx answer. */
export function ok(data: unknown, meta?: unknown, status = 200): PayHubResponse {
  return jsonResponse(status, {
    status: 'success',
    code: status === 201 ? 'resource_created' : 'success',
    message: 'OK',
    timestamp: '2026-11-16T10:00:00+00:00',
    request_id: 'req-from-envelope',
    data,
    ...(meta === undefined ? {} : { meta }),
  });
}

/** A transport that never answers until it is aborted (to exercise timeouts). */
export const hang: Reply = (_url, init) =>
  new Promise((_resolve, reject) => {
    init.signal?.addEventListener('abort', () => {
      reject(new DOMException('This operation was aborted', 'AbortError'));
    });
  });

/**
 * Records every call and replays queued replies — no real network is ever
 * touched.
 */
export class FakeFetch {
  readonly calls: RecordedCall[] = [];
  private readonly queue: Reply[];

  constructor(replies: Reply[]) {
    this.queue = [...replies];
  }

  get lastCall(): RecordedCall | undefined {
    return this.calls.at(-1);
  }

  /** The JSON body of call `index` (default: the last one). */
  body(index = this.calls.length - 1): Record<string, unknown> {
    const raw = this.calls[index]?.init.body;
    return raw === undefined ? {} : (JSON.parse(raw) as Record<string, unknown>);
  }

  readonly fn: FetchFn = (url, init) => {
    this.calls.push({ url, init });
    const next = this.queue.shift();
    if (next === undefined) {
      return Promise.reject(new Error('FakeFetch: no more queued responses.'));
    }
    if (next instanceof Error) {
      return Promise.reject(next);
    }
    if (typeof next === 'function') {
      return next(url, init);
    }
    return Promise.resolve(next);
  };
}
