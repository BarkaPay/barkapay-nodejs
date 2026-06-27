import type { ApiClient } from '../apiClient';
import { hydrateBalance } from '../dto';
import { coerceObject } from '../util';
import type { Balance, CallOptions } from '../types';

export class BalanceResource {
  constructor(private readonly api: ApiClient) {}

  /** The merchant's wallet balance for the country. */
  async get(options: CallOptions = {}): Promise<Balance> {
    const env = await this.api.request('GET', 'balance', { country: options.country });
    return hydrateBalance(coerceObject(env, 'data') ?? {});
  }
}
