import {
  PAYMENT_LINK_STATUSES,
  PAYMENT_STATUSES,
  TRANSFER_STATUSES,
  type Balance,
  type Pagination,
  type Payment,
  type PaymentLink,
  type PaymentLinkList,
  type PaymentLinkPaymentList,
  type PaymentLinkStats,
  type PaymentLinkStatus,
  type PaymentLinkSummary,
  type PaymentList,
  type PaymentStatus,
  type Transfer,
  type TransferList,
  type TransferStatus,
} from './types';
import {
  coerceAmount,
  coerceArray,
  coerceBool,
  coerceDecimal,
  coerceInt,
  coerceObject,
  coerceStr,
  coerceStrArray,
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

function asPaymentLinkStatus(value: string | null): PaymentLinkStatus | null {
  return value !== null && (PAYMENT_LINK_STATUSES as readonly string[]).includes(value)
    ? (value as PaymentLinkStatus)
    : null;
}

export function hydratePayment(data: Record<string, unknown>): Payment {
  return {
    object: 'payment',
    publicId: coerceStr(data, 'public_id') ?? '',
    amount: coerceAmount(data, 'amount'),
    fees: coerceDecimal(data, 'fees'),
    currency: coerceStr(data, 'currency'),
    phoneNumber: coerceStr(data, 'phone_number'),
    country: coerceStr(data, 'country'),
    operator: coerceStr(data, 'operator'),
    channel: coerceStr(data, 'channel'),
    status: asPaymentStatus(coerceStr(data, 'status')),
    orderId: coerceStr(data, 'order_id'),
    providerTransactionId: coerceStr(data, 'provider_transaction_id'),
    providerReference: coerceStr(data, 'provider_reference'),
    orderData: coerceObject(data, 'order_data'),
    linkPublicId: coerceStr(data, 'link_public_id'),
    reason: coerceStr(data, 'reason'),
    reasonCode: coerceStr(data, 'reason_code'),
    providerReason: coerceStr(data, 'provider_reason'),
    redirectUrl: coerceStr(data, 'redirect_url'),
    createdAt: coerceStr(data, 'created_at'),
    raw: data,
  };
}

export function hydrateTransfer(data: Record<string, unknown>): Transfer {
  return {
    object: 'transfer',
    publicId: coerceStr(data, 'public_id') ?? '',
    amount: coerceAmount(data, 'amount'),
    fees: coerceDecimal(data, 'fees'),
    currency: coerceStr(data, 'currency'),
    phoneNumber: coerceStr(data, 'phone_number'),
    country: coerceStr(data, 'country'),
    operator: coerceStr(data, 'operator'),
    channel: coerceStr(data, 'channel'),
    status: asTransferStatus(coerceStr(data, 'status')),
    orderId: coerceStr(data, 'order_id'),
    providerTransactionId: coerceStr(data, 'provider_transaction_id'),
    providerReference: coerceStr(data, 'provider_reference'),
    orderData: coerceObject(data, 'order_data'),
    reason: coerceStr(data, 'reason'),
    reasonCode: coerceStr(data, 'reason_code'),
    providerReason: coerceStr(data, 'provider_reason'),
    createdAt: coerceStr(data, 'created_at'),
    raw: data,
  };
}

export function hydrateBalance(data: Record<string, unknown>): Balance {
  const balancesRaw = coerceArray(data, 'balances');
  const balances = balancesRaw === null ? null : balancesRaw.filter(isRecord);

  return {
    country: coerceStr(data, 'country'),
    currency: coerceStr(data, 'currency'),
    available: coerceDecimal(data, 'available'),
    total: coerceDecimal(data, 'total'),
    holds: coerceDecimal(data, 'holds'),
    balances,
    raw: data,
  };
}

function hydrateStats(stats: Record<string, unknown> | null): PaymentLinkStats {
  return {
    paymentsCount: stats === null ? null : coerceInt(stats, 'payments_count'),
    totalCollected: stats === null ? null : coerceDecimal(stats, 'total_collected'),
  };
}

export function hydratePaymentLink(data: Record<string, unknown>): PaymentLink {
  const amount = coerceObject(data, 'amount') ?? {};
  const redirect = coerceObject(data, 'redirect');
  const restrictions = coerceObject(data, 'restrictions');
  const payer = coerceObject(data, 'payer');
  const notify = coerceObject(data, 'notify');

  return {
    object: 'payment_link',
    publicId: coerceStr(data, 'public_id') ?? '',
    slug: coerceStr(data, 'slug'),
    url: coerceStr(data, 'url'),
    status: asPaymentLinkStatus(coerceStr(data, 'status')),
    source: coerceStr(data, 'source'),
    usage: coerceStr(data, 'usage'),
    amount: {
      type: coerceStr(amount, 'type'),
      value: coerceDecimal(amount, 'value'),
      min: coerceDecimal(amount, 'min'),
      max: coerceDecimal(amount, 'max'),
      currency: coerceStr(amount, 'currency'),
    },
    title: coerceStr(data, 'title'),
    description: coerceStr(data, 'description'),
    order: coerceObject(data, 'order'),
    redirect:
      redirect === null
        ? null
        : {
            successUrl: coerceStr(redirect, 'success_url'),
            cancelUrl: coerceStr(redirect, 'cancel_url'),
          },
    restrictions:
      restrictions === null
        ? null
        : {
            countries: coerceStrArray(restrictions, 'countries'),
            operators: coerceStrArray(restrictions, 'operators'),
          },
    payer:
      payer === null
        ? null
        : {
            fullName: coerceStr(payer, 'full_name'),
            email: coerceStr(payer, 'email'),
            phone: coerceStr(payer, 'phone'),
            locale: coerceStr(payer, 'locale'),
          },
    collect: coerceObject(data, 'collect') ?? {},
    notifyEmailInvoice: notify === null ? null : coerceBool(notify, 'email_invoice'),
    expiresAt: coerceStr(data, 'expires_at'),
    stats: hydrateStats(coerceObject(data, 'stats')),
    paidByPaymentPublicId: coerceStr(data, 'paid_by_payment_public_id'),
    createdAt: coerceStr(data, 'created_at'),
    raw: data,
  };
}

function hydratePaymentLinkSummary(data: Record<string, unknown>): PaymentLinkSummary {
  return {
    publicId: coerceStr(data, 'public_id') ?? '',
    slug: coerceStr(data, 'slug'),
    status: asPaymentLinkStatus(coerceStr(data, 'status')),
    stats: hydrateStats(coerceObject(data, 'stats')),
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

function paginationOf(envelope: Record<string, unknown>): Pagination | null {
  const meta = coerceObject(envelope, 'meta');
  return meta !== null ? hydratePagination(meta) : null;
}

/** Rows under `data.<rowsKey>`, keeping only JSON objects. */
function rowsOf(
  envelope: Record<string, unknown>,
  rowsKey: string,
): Record<string, unknown>[] {
  const data = coerceObject(envelope, 'data') ?? {};
  const rows = coerceArray(data, rowsKey) ?? [];
  return rows.filter(isRecord);
}

export function hydratePaymentList(envelope: Record<string, unknown>): PaymentList {
  return {
    data: rowsOf(envelope, 'payments').map(hydratePayment),
    meta: paginationOf(envelope),
  };
}

export function hydrateTransferList(envelope: Record<string, unknown>): TransferList {
  return {
    data: rowsOf(envelope, 'transfers').map(hydrateTransfer),
    meta: paginationOf(envelope),
  };
}

export function hydratePaymentLinkList(
  envelope: Record<string, unknown>,
): PaymentLinkList {
  return {
    data: rowsOf(envelope, 'payment_links').map(hydratePaymentLink),
    meta: paginationOf(envelope),
  };
}

export function hydratePaymentLinkPaymentList(
  envelope: Record<string, unknown>,
): PaymentLinkPaymentList {
  const data = coerceObject(envelope, 'data') ?? {};
  const link = coerceObject(data, 'payment_link');

  return {
    data: rowsOf(envelope, 'payments').map(hydratePayment),
    meta: paginationOf(envelope),
    paymentLink: link === null ? null : hydratePaymentLinkSummary(link),
  };
}

/** First row under `data.<rowsKey>` (used by the by-id lookups). */
export function firstRow(
  envelope: Record<string, unknown>,
  rowsKey: string,
): Record<string, unknown> | null {
  return rowsOf(envelope, rowsKey)[0] ?? null;
}

/** The object under `data.<key>` (single-resource responses), or null when absent. */
export function resourceOf(
  envelope: Record<string, unknown>,
  key: string,
): Record<string, unknown> | null {
  const data = coerceObject(envelope, 'data') ?? {};
  return coerceObject(data, key);
}
