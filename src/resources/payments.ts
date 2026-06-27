import type { ApiClient } from '../apiClient';
import { firstRow, hydratePayment, hydratePaymentList } from '../dto';
import { NotFoundError } from '../errors';
import { coerceObject } from '../util';
import type {
  CallOptions,
  ListFilters,
  Payment,
  PaymentCreateParams,
  PaymentList,
} from '../types';

function unwrapPayment(envelope: Record<string, unknown>): Record<string, unknown> {
  const data = coerceObject(envelope, 'data') ?? {};
  return coerceObject(data, 'payment') ?? {};
}

export class Payments {
  constructor(private readonly api: ApiClient) {}

  /** Create a collection (payment): operator, phone_number, amount, order{…}, otp? */
  async create(params: PaymentCreateParams, options: CallOptions = {}): Promise<Payment> {
    const env = await this.api.request('POST', 'payments', {
      country: options.country,
      body: params,
    });
    return hydratePayment(unwrapPayment(env));
  }

  /** List payments. Filters: status, operator, from_date, to_date, per_page, … */
  async list(filters: ListFilters = {}, options: CallOptions = {}): Promise<PaymentList> {
    const env = await this.api.request('GET', 'payments', {
      country: options.country,
      query: filters,
    });
    return hydratePaymentList(env);
  }

  /** Look up a payment by its public_id (UUID) or your order_id. */
  async get(id: string, options: CallOptions = {}): Promise<Payment> {
    const env = await this.api.request('GET', `payments/${encodeURIComponent(id)}`, {
      country: options.country,
    });
    const row = firstRow(env, 'payments');
    if (row === null) {
      throw new NotFoundError(`No payment found for "${id}".`, {
        code: 'resource_not_found',
        httpStatus: 404,
      });
    }
    return hydratePayment(row);
  }

  /** Confirm a payment that is AWAITING_OTP (operators that require an OTP step). */
  async confirmOtp(publicId: string, otp: string, options: CallOptions = {}): Promise<Payment> {
    const env = await this.api.request(
      'POST',
      `payments/${encodeURIComponent(publicId)}/confirm-otp`,
      { country: options.country, body: { otp } },
    );
    return hydratePayment(unwrapPayment(env));
  }

  async resendOtp(publicId: string, options: CallOptions = {}): Promise<void> {
    await this.api.request('POST', `payments/${encodeURIComponent(publicId)}/resend-otp`, {
      country: options.country,
    });
  }
}
