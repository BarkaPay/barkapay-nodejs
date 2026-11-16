import type { ApiClient } from '../apiClient';
import type { CallOptions, OperatorsAvailability, OperatorsInfo } from '../types';
import { expectData } from './shared';

export class Operators {
  readonly #api: ApiClient;

  constructor(api: ApiClient) {
    this.#api = api;
  }

  /** Real-time payment/transfer availability per operator (`operational`, `degraded`, `down`). */
  async availability(options: CallOptions = {}): Promise<OperatorsAvailability> {
    const env = await this.#api.request('GET', 'operators/availability', {
      country: options.country,
    });
    return expectData(env);
  }

  /**
   * Operator capabilities (OTP requirement, amount bounds, payer instructions).
   * This is the authoritative list of operators for the country.
   */
  async info(options: CallOptions = {}): Promise<OperatorsInfo> {
    const env = await this.#api.request('GET', 'operators/info', {
      country: options.country,
    });
    return expectData(env);
  }
}
