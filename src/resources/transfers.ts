import type { ApiClient } from '../apiClient';
import { firstRow, hydrateTransfer, hydrateTransferList } from '../dto';
import { NotFoundError } from '../errors';
import { coerceObject } from '../util';
import type {
  CallOptions,
  ListFilters,
  Transfer,
  TransferCreateParams,
  TransferList,
} from '../types';

function unwrapTransfer(envelope: Record<string, unknown>): Record<string, unknown> {
  const data = coerceObject(envelope, 'data') ?? {};
  return coerceObject(data, 'transfer') ?? {};
}

export class Transfers {
  constructor(private readonly api: ApiClient) {}

  /** Create a disbursement (transfer): operator, phone_number, amount, order{…}. */
  async create(params: TransferCreateParams, options: CallOptions = {}): Promise<Transfer> {
    const env = await this.api.request('POST', 'transfers', {
      country: options.country,
      body: params,
    });
    return hydrateTransfer(unwrapTransfer(env));
  }

  /** List transfers. */
  async list(filters: ListFilters = {}, options: CallOptions = {}): Promise<TransferList> {
    const env = await this.api.request('GET', 'transfers', {
      country: options.country,
      query: filters,
    });
    return hydrateTransferList(env);
  }

  /** Look up a transfer by its public_id (UUID) or your order_id. */
  async get(id: string, options: CallOptions = {}): Promise<Transfer> {
    const env = await this.api.request('GET', `transfers/${encodeURIComponent(id)}`, {
      country: options.country,
    });
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
