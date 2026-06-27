/**
 * Minimal transport contract. The SDK uses the global `fetch` (Node 18+) by
 * default; pass your own `fetch`-compatible function to integrate a custom HTTP
 * stack or to fake the network in tests. The shape is intentionally narrow so a
 * fake is trivial to write, while the global `fetch` remains assignable.
 */
export interface PayHubRequestInit {
  method: string;
  headers: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
}

export interface PayHubResponse {
  status: number;
  text(): Promise<string>;
}

export type FetchFn = (url: string, init: PayHubRequestInit) => Promise<PayHubResponse>;
