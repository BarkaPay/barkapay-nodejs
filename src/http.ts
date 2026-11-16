/**
 * Minimal transport contract. The SDK uses the global `fetch` (Node 18+) by
 * default; pass your own `fetch`-compatible function to integrate a custom HTTP
 * stack or to fake the network in tests. The shape is intentionally narrow so a
 * fake is trivial to write, while the global `fetch` remains assignable.
 */
export interface BarkaPayRequestInit {
  method: string;
  headers: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
  /**
   * Always `'manual'`: the SDK never follows a redirect, so the
   * `Authorization` header can never be replayed against another URL. A
   * custom transport must honour it (or at least never forward credentials
   * across a redirect).
   */
  redirect?: 'manual';
}

/** The subset of response headers the SDK reads (`Retry-After`, `X-Request-Id`). */
export interface BarkaPayResponseHeaders {
  get(name: string): string | null;
}

export interface BarkaPayResponse {
  status: number;
  /** Optional so that a minimal fake (`{ status, text }`) stays valid. */
  headers?: BarkaPayResponseHeaders;
  text(): Promise<string>;
}

export type FetchFn = (
  url: string,
  init: BarkaPayRequestInit,
) => Promise<BarkaPayResponse>;
