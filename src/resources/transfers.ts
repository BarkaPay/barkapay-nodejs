import type { ApiClient } from '../apiClient';
import { firstRow, hydrateTransfer, hydrateTransferList } from '../dto';
import { NotFoundError } from '../errors';
import { pathSegment } from '../path';
import type {
  CallOptions,
  Transfer,
  TransferCreateParams,
  TransferList,
  TransferListParams,
} from '../types';
import { expectResource } from './shared';

export class Transfers {
  readonly #api: ApiClient;

  constructor(api: ApiClient) {
    this.#api = api;
  }

  /**
   * Create a disbursement (transfer): `operator`, `phone_number`, `amount`,
   * `order: { id }`.
   *
   * A transfer whose status is `UNCERTAIN` was accepted but the operator has
   * not confirmed yet: do NOT send it again, the verdict arrives by webhook.
   * A refused transfer rejects with `TransferFailedError`, an underfunded one
   * with `InsufficientBalanceError`, a duplicate with `ConflictError`.
   *
   * ⚠️ Never re-sent automatically on a timeout or a 5xx (it could pay the
   * recipient twice). Set `order.unique: true` and, if the outcome is unknown,
   * look the transfer up with `transfers.list({ order_id })` before retrying.
   */
  async create(
    params: TransferCreateParams,
    options: CallOptions = {},
  ): Promise<Transfer> {
    const env = await this.#api.request('POST', 'transfers', {
      country: options.country,
      body: params,
    });
    return hydrateTransfer(expectResource(env, 'transfer'));
  }

  /**
   * List transfers, newest first. Filters: `status`, `operator`,
   * `phone_number`, `channel`, `order_id`, `amount` + `amount_operator`,
   * `from_date` + `to_date` (both or neither), `page`, `per_page` (max 200).
   */
  async list(
    filters: TransferListParams = {},
    options: CallOptions = {},
  ): Promise<TransferList> {
    const env = await this.#api.request('GET', 'transfers', {
      country: options.country,
      query: filters,
    });
    return hydrateTransferList(env);
  }

  /**
   * Look up a transfer by its `publicId` (UUID) or by your `order.id`.
   *
   * An id shaped like a UUID is always read as a `publicId`. If several
   * transfers share the same order id, the first match is returned — use
   * `list({ order_id })` to get them all.
   */
  async get(id: string, options: CallOptions = {}): Promise<Transfer> {
    const env = await this.#api.request(
      'GET',
      `transfers/${pathSegment(id, 'transfer id')}`,
      {
        country: options.country,
      },
    );
    const row = firstRow(env, 'transfers');
    if (row === null) {
      throw new NotFoundError(`No transfer found for "${id}".`, {
        code: 'resource_not_found',
        httpStatus: 404,
      });
    }
    return hydrateTransfer(row);
  }
}
