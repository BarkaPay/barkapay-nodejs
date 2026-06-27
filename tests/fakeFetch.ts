import type { FetchFn, PayHubRequestInit, PayHubResponse } from '../src/http';

export interface RecordedCall {
  url: string;
  init: PayHubRequestInit;
}

/** Build a fake JSON response (no network). */
export function jsonResponse(status: number, body: unknown): PayHubResponse {
  const text = JSON.stringify(body);
  return { status, text: () => Promise.resolve(text) };
}

/**
 * Records every call and replays queued responses (or throws queued errors) —
 * no real network is ever touched.
 */
export class FakeFetch {
  readonly calls: RecordedCall[] = [];
  private readonly queue: (PayHubResponse | Error)[];

  constructor(responses: (PayHubResponse | Error)[]) {
    this.queue = [...responses];
  }

  get lastCall(): RecordedCall | undefined {
    return this.calls.at(-1);
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
    return Promise.resolve(next);
  };
}
