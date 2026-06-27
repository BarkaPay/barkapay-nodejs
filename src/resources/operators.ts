import type { ApiClient } from '../apiClient';
import { coerceObject } from '../util';
import type { CallOptions } from '../types';

export class Operators {
  constructor(private readonly api: ApiClient) {}

  /** Real-time payment/transfer availability per operator. */
  async availability(options: CallOptions = {}): Promise<Record<string, unknown>> {
    const env = await this.api.request('GET', 'operators/availability', {
      country: options.country,
    });
    return coerceObject(env, 'data') ?? {};
  }

  /**
   * Operator capabilities (OTP requirement, amount bounds, instructions). This
   * is the authoritative list of operators for the country.
   */
  async info(options: CallOptions = {}): Promise<Record<string, unknown>> {
    const env = await this.api.request('GET', 'operators/info', { country: options.country });
    return coerceObject(env, 'data') ?? {};
  }
}
