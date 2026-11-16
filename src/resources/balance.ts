import type { ApiClient } from '../apiClient';
import { hydrateBalance } from '../dto';
import type { Balance, CallOptions } from '../types';
import { expectData } from './shared';

export class BalanceResource {
  readonly #api: ApiClient;

  constructor(api: ApiClient) {
    this.#api = api;
  }

  /** The merchant's wallet balance for the country. */
  async get(options: CallOptions = {}): Promise<Balance> {
    const env = await this.#api.request('GET', 'balance', { country: options.country });
    return hydrateBalance(expectData(env));
  }
}
