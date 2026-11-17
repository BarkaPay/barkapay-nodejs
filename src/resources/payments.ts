import type { ApiClient } from '../apiClient';
import { firstRow, hydratePayment, hydratePaymentList } from '../dto';
import { ConfigurationError, NotFoundError } from '../errors';
import { pathSegment } from '../path';
import type {
  CallOptions,
  Payment,
  PaymentCreateParams,
  PaymentList,
  PaymentListParams,
} from '../types';
import { expectResource, expectRows } from './shared';

export class Payments {
  readonly #api: ApiClient;

  constructor(api: ApiClient) {
    this.#api = api;
  }

  /**
   * Create a collection (payment): charge a payer now. Pass `operator`,
   * `phone_number`, `amount`, `order: { id }` and, for operators that take it
   * up-front, `otp`. Branch on the returned `status` (`SUCCESSFUL`,
   * `AWAITING_OTP`, `PROCESSING_OPERATOR`…).
   *
   * Optional `return_url` / `cancel_url`: where an operator that redirects the
   * payer (WAVE in Sénégal) sends them back. Only sent when given; validated
   * by the API (422 `ValidationError`). The return is not a proof of payment.
   *
   * This is always a direct payment. For a hosted checkout page where the
   * payer chooses how to pay, use `paymentLinks.create`.
   *
   * A refused payment rejects with `PaymentFailedError` (its `payment`
   * property holds the `FAILED` snapshot).
   *
   * ⚠️ Never re-sent automatically on a timeout or a 5xx (it could charge the
   * payer twice). Set `order.unique: true` and, if the outcome is unknown,
   * look the payment up with `payments.list({ order_id })` before retrying.
   */
  async create(params: PaymentCreateParams, options: CallOptions = {}): Promise<Payment> {
    if (typeof params !== 'object' || params === null) {
      throw new ConfigurationError('`payments.create` expects an object of parameters.');
    }
    const env = await this.#api.request('POST', 'payments', {
      country: options.country,
      body: params,
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
    expectRows(env, 'payments');
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
    expectRows(env, 'payments');
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
   *
   * Only operators that send the OTP after creation use this step — today
   * MOOV in Burkina Faso; the endpoint exists on `bf` only.
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

  /** Send the payer a new OTP for a payment that is still `AWAITING_OTP` (`bf` only, see `confirmOtp`). */
  async resendOtp(publicId: string, options: CallOptions = {}): Promise<void> {
    await this.#api.request(
      'POST',
      `payments/${pathSegment(publicId, 'payment id')}/resend-otp`,
      { country: options.country, allowEmpty: true },
    );
  }
}
