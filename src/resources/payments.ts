import type { ApiClient } from '../apiClient';
import { firstRow, hydratePayment, hydratePaymentLink, hydratePaymentList } from '../dto';
import { ConfigurationError, NotFoundError } from '../errors';
import { pathSegment } from '../path';
import type {
  CallOptions,
  HostedPaymentCreateParams,
  Payment,
  PaymentCreateParams,
  PaymentCreateResult,
  PaymentLink,
  PaymentList,
  PaymentListParams,
} from '../types';
import { expectResource } from './shared';

export class Payments {
  readonly #api: ApiClient;

  constructor(api: ApiClient) {
    this.#api = api;
  }

  /**
   * Create a collection (payment).
   *
   * - `channel: 'direct'` (default) — charge a payer now: `operator`,
   *   `phone_number`, `amount`, `order: { id }` and, for operators that take
   *   it up-front, `otp`. Resolves to a {@link Payment}; branch on its
   *   `status` (`SUCCESSFUL`, `AWAITING_OTP`, `PROCESSING_OPERATOR`…).
   * - `channel: 'hosted'` — create a payment link instead and let the payer
   *   choose how to pay on the barkapay checkout. Takes the same fields as
   *   `paymentLinks.create` and resolves to a {@link PaymentLink}.
   *
   * A refused payment rejects with `PaymentFailedError` (its `payment`
   * property holds the `FAILED` snapshot).
   *
   * ⚠️ Never re-sent automatically on a timeout or a 5xx (it could charge the
   * payer twice). Set `order.unique: true` and, if the outcome is unknown,
   * look the payment up with `payments.list({ order_id })` before retrying.
   */
  create(params: PaymentCreateParams, options?: CallOptions): Promise<Payment>;
  create(params: HostedPaymentCreateParams, options?: CallOptions): Promise<PaymentLink>;
  create(
    params: PaymentCreateParams | HostedPaymentCreateParams,
    options?: CallOptions,
  ): Promise<PaymentCreateResult>;
  async create(
    params: PaymentCreateParams | HostedPaymentCreateParams,
    options: CallOptions = {},
  ): Promise<PaymentCreateResult> {
    if (typeof params !== 'object' || params === null) {
      throw new ConfigurationError('`payments.create` expects an object of parameters.');
    }

    // `channel` is an SDK-level switch: the API has one endpoint per kind and
    // would silently ignore the field, so it is never put on the wire.
    const { channel, ...body } = params as Record<string, unknown>;

    if (channel === 'hosted') {
      const env = await this.#api.request('POST', 'payments/links', {
        country: options.country,
        body,
      });
      return hydratePaymentLink(expectResource(env, 'payment_link'));
    }

    if (channel !== undefined && channel !== 'direct') {
      throw new ConfigurationError('`channel` must be "direct" or "hosted".');
    }

    const env = await this.#api.request('POST', 'payments', {
      country: options.country,
      body,
    });
    return hydratePayment(expectResource(env, 'payment'));
  }

  /**
   * List payments, newest first. Filters: `status`, `operator`, `phone_number`,
   * `channel`, `order_id`, `amount` + `amount_operator`, `from_date` +
   * `to_date` (both or neither), `page`, `per_page` (max 200).
   */
  async list(
    filters: PaymentListParams = {},
    options: CallOptions = {},
  ): Promise<PaymentList> {
    const env = await this.#api.request('GET', 'payments', {
      country: options.country,
      query: filters,
    });
    return hydratePaymentList(env);
  }

  /**
   * Look up a payment by its `publicId` (UUID) or by your `order.id`.
   *
   * An id shaped like a UUID is always read as a `publicId`. If several
   * payments share the same order id, the first match is returned — use
   * `list({ order_id })` to get them all.
   */
  async get(id: string, options: CallOptions = {}): Promise<Payment> {
    const env = await this.#api.request(
      'GET',
      `payments/${pathSegment(id, 'payment id')}`,
      {
        country: options.country,
      },
    );
    const row = firstRow(env, 'payments');
    if (row === null) {
      throw new NotFoundError(`No payment found for "${id}".`, {
        code: 'resource_not_found',
        httpStatus: 404,
      });
    }
    return hydratePayment(row);
  }

  /**
   * Confirm a payment that is `AWAITING_OTP` with the code the payer received.
   * Pass the OTP as a string: a leading zero is significant.
   */
  async confirmOtp(
    publicId: string,
    otp: string,
    options: CallOptions = {},
  ): Promise<Payment> {
    const env = await this.#api.request(
      'POST',
      `payments/${pathSegment(publicId, 'payment id')}/confirm-otp`,
      { country: options.country, body: { otp: String(otp) } },
    );
    return hydratePayment(expectResource(env, 'payment'));
  }

  /** Send the payer a new OTP for a payment that is still `AWAITING_OTP`. */
  async resendOtp(publicId: string, options: CallOptions = {}): Promise<void> {
    await this.#api.request(
      'POST',
      `payments/${pathSegment(publicId, 'payment id')}/resend-otp`,
      { country: options.country },
    );
  }
}
