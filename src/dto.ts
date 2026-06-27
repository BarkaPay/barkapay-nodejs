import {
  PAYMENT_STATUSES,
  TRANSFER_STATUSES,
  type Balance,
  type Pagination,
  type Payment,
  type PaymentList,
  type PaymentStatus,
  type Transfer,
  type TransferList,
  type TransferStatus,
} from './types';
import {
  coerceAmount,
  coerceArray,
  coerceInt,
  coerceObject,
  coerceStr,
  isRecord,
} from './util';

function asPaymentStatus(value: string | null): PaymentStatus | null {
  return value !== null && (PAYMENT_STATUSES as readonly string[]).includes(value)
    ? (value as PaymentStatus)
    : null;
}

function asTransferStatus(value: string | null): TransferStatus | null {
  return value !== null && (TRANSFER_STATUSES as readonly string[]).includes(value)
    ? (value as TransferStatus)
    : null;
}

export function hydratePayment(data: Record<string, unknown>): Payment {
  return {
    publicId: coerceStr(data, 'public_id') ?? '',
    amount: coerceAmount(data, 'amount'),
    fees: coerceStr(data, 'fees'),
    currency: coerceStr(data, 'currency'),
    phoneNumber: coerceStr(data, 'phone_number'),
    country: coerceStr(data, 'country'),
    operator: coerceStr(data, 'operator'),
    channel: coerceStr(data, 'channel'),
    status: asPaymentStatus(coerceStr(data, 'status')),
    orderId: coerceStr(data, 'order_id'),
    providerTransactionId: coerceStr(data, 'provider_transaction_id'),
    orderData: coerceObject(data, 'order_data'),
    reason: coerceStr(data, 'reason'),
    createdAt: coerceStr(data, 'created_at'),
    raw: data,
  };
}

export function hydrateTransfer(data: Record<string, unknown>): Transfer {
  return {
    publicId: coerceStr(data, 'public_id') ?? '',
    amount: coerceAmount(data, 'amount'),
    fees: coerceStr(data, 'fees'),
    currency: coerceStr(data, 'currency'),
    phoneNumber: coerceStr(data, 'phone_number'),
    country: coerceStr(data, 'country'),
    operator: coerceStr(data, 'operator'),
    channel: coerceStr(data, 'channel'),
    status: asTransferStatus(coerceStr(data, 'status')),
    orderId: coerceStr(data, 'order_id'),
    providerTransactionId: coerceStr(data, 'provider_transaction_id'),
    orderData: coerceObject(data, 'order_data'),
    reason: coerceStr(data, 'reason'),
    createdAt: coerceStr(data, 'created_at'),
    raw: data,
  };
}

export function hydrateBalance(data: Record<string, unknown>): Balance {
  const balancesRaw = coerceArray(data, 'balances');
  const balances =
    balancesRaw === null ? null : balancesRaw.filter(isRecord);

  return {
    country: coerceStr(data, 'country'),
    currency: coerceStr(data, 'currency'),
    available: coerceStr(data, 'available'),
    total: coerceStr(data, 'total'),
    holds: coerceStr(data, 'holds'),
    balances,
    raw: data,
  };
}

function hydratePagination(meta: Record<string, unknown>): Pagination {
  return {
    currentPage: coerceInt(meta, 'current_page'),
    lastPage: coerceInt(meta, 'last_page'),
    perPage: coerceInt(meta, 'per_page'),
    total: coerceInt(meta, 'total'),
  };
}

/** Rows under `data.<rowsKey>` hydrated through `hydrate`, plus optional `meta`. */
function rowsOf(envelope: Record<string, unknown>, rowsKey: string): Record<string, unknown>[] {
  const data = coerceObject(envelope, 'data') ?? {};
  const rows = coerceArray(data, rowsKey) ?? [];
  return rows.filter(isRecord);
}

export function hydratePaymentList(envelope: Record<string, unknown>): PaymentList {
  const meta = coerceObject(envelope, 'meta');
  return {
    data: rowsOf(envelope, 'payments').map(hydratePayment),
    meta: meta !== null ? hydratePagination(meta) : null,
  };
}

export function hydrateTransferList(envelope: Record<string, unknown>): TransferList {
  const meta = coerceObject(envelope, 'meta');
  return {
    data: rowsOf(envelope, 'transfers').map(hydrateTransfer),
    meta: meta !== null ? hydratePagination(meta) : null,
  };
}

/** First row under `data.<rowsKey>` (used by the by-id lookups). */
export function firstRow(
  envelope: Record<string, unknown>,
  rowsKey: string,
): Record<string, unknown> | null {
  return rowsOf(envelope, rowsKey)[0] ?? null;
}
