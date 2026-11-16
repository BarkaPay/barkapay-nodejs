import type { ApiClient } from '../apiClient';
import {
  hydratePaymentLink,
  hydratePaymentLinkList,
  hydratePaymentLinkPaymentList,
} from '../dto';
import { pathSegment } from '../path';
import type {
  CallOptions,
  PaymentLink,
  PaymentLinkCreateParams,
  PaymentLinkList,
  PaymentLinkListParams,
  PaymentLinkPaymentList,
  PaymentLinkPaymentListParams,
  PaymentLinkUpdateParams,
} from '../types';
import { expectResource, expectRows } from './shared';

/**
 * Payment links — durable pages on the barkapay-hosted checkout. Wherever an
 * `id` is expected you can pass the `PL-…` public id or the 13-character slug.
 */
export class PaymentLinks {
  readonly #api: ApiClient;

  constructor(api: ApiClient) {
    this.#api = api;
  }

  /**
   * Create a payment link (`title` + `amount` are required). No payment exists
   * yet: payments are born when your customers pay on `link.url`.
   *
   * ⚠️ Never re-sent automatically on a timeout or a 5xx (it could create the
   * link twice).
   */
  async create(
    params: PaymentLinkCreateParams,
    options: CallOptions = {},
  ): Promise<PaymentLink> {
    const env = await this.#api.request('POST', 'payments/links', {
      country: options.country,
      body: params,
    });
    return hydratePaymentLink(expectResource(env, 'payment_link'));
  }

  /**
   * List your payment links, newest first. Filters: `status` (one or several,
   * comma-separated), `usage`, `source`, `page`, `per_page` (max 100).
   */
  async list(
    params: PaymentLinkListParams = {},
    options: CallOptions = {},
  ): Promise<PaymentLinkList> {
    const env = await this.#api.request('GET', 'payments/links', {
      country: options.country,
      query: params,
    });
    expectRows(env, 'payment_links');
    return hydratePaymentLinkList(env);
  }

  /** Retrieve a payment link by its `PL-…` id or its slug. */
  async get(id: string, options: CallOptions = {}): Promise<PaymentLink> {
    const env = await this.#api.request('GET', linkPath(id), {
      country: options.country,
    });
    return hydratePaymentLink(expectResource(env, 'payment_link'));
  }

  /**
   * Edit an active or paused link. Only `title`, `description`, `expires_at`
   * and `redirect` can change; pass `null` to clear a nullable field.
   */
  async update(
    id: string,
    params: PaymentLinkUpdateParams,
    options: CallOptions = {},
  ): Promise<PaymentLink> {
    const env = await this.#api.request('PATCH', linkPath(id), {
      country: options.country,
      body: params,
    });
    return hydratePaymentLink(expectResource(env, 'payment_link'));
  }

  /** Cancel a link for good (active or paused → canceled). Cancelling twice is harmless. */
  async cancel(id: string, options: CallOptions = {}): Promise<PaymentLink> {
    const env = await this.#api.request('DELETE', linkPath(id), {
      country: options.country,
    });
    return hydratePaymentLink(expectResource(env, 'payment_link'));
  }

  /**
   * Pause an active link: the checkout refuses new payers at once. A link in
   * any other state is returned unchanged — check `status` on the result.
   */
  async pause(id: string, options: CallOptions = {}): Promise<PaymentLink> {
    const env = await this.#api.request('POST', `${linkPath(id)}/pause`, {
      country: options.country,
    });
    return hydratePaymentLink(expectResource(env, 'payment_link'));
  }

  /**
   * Re-open a paused link. A link in any other state is returned unchanged —
   * check `status` on the result.
   */
  async resume(id: string, options: CallOptions = {}): Promise<PaymentLink> {
    const env = await this.#api.request('POST', `${linkPath(id)}/resume`, {
      country: options.country,
    });
    return hydratePaymentLink(expectResource(env, 'payment_link'));
  }

  /**
   * Payments made through a link, newest first — the country you call only.
   * A link open to several countries spreads its payments across them: call
   * each one (`{ country }`) for the full picture. `paymentLink.stats` on the
   * result is global either way.
   */
  async listPayments(
    id: string,
    params: PaymentLinkPaymentListParams = {},
    options: CallOptions = {},
  ): Promise<PaymentLinkPaymentList> {
    const env = await this.#api.request('GET', `${linkPath(id)}/payments`, {
      country: options.country,
      query: params,
    });
    expectRows(env, 'payments');
    return hydratePaymentLinkPaymentList(env);
  }
}

function linkPath(id: string): string {
  return `payments/links/${pathSegment(id, 'payment link id')}`;
}
