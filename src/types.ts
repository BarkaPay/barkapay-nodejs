/** Lifecycle of a collection (payment). */
export type PaymentStatus =
  | 'CREATED'
  | 'AWAITING_OTP'
  | 'QUEUED_FOR_PROCESSING'
  | 'PROCESSING_OPERATOR'
  | 'PROCESSING_SYSTEM'
  | 'SUCCESSFUL'
  | 'FAILED'
  | 'COMPLIANCE_FLAGGED'
  | 'CANCELED';

/** Lifecycle of a disbursement (transfer). */
export type TransferStatus =
  | 'CREATED'
  | 'PROCESSING_OPERATOR'
  | 'PROCESSING_SYSTEM'
  | 'SUCCESSFUL'
  | 'FAILED'
  | 'COMPLIANCE_FLAGGED'
  | 'REFUNDED'
  | 'UNRESOLVED';

export const PAYMENT_STATUSES: readonly PaymentStatus[] = [
  'CREATED',
  'AWAITING_OTP',
  'QUEUED_FOR_PROCESSING',
  'PROCESSING_OPERATOR',
  'PROCESSING_SYSTEM',
  'SUCCESSFUL',
  'FAILED',
  'COMPLIANCE_FLAGGED',
  'CANCELED',
];

export const TRANSFER_STATUSES: readonly TransferStatus[] = [
  'CREATED',
  'PROCESSING_OPERATOR',
  'PROCESSING_SYSTEM',
  'SUCCESSFUL',
  'FAILED',
  'COMPLIANCE_FLAGGED',
  'REFUNDED',
  'UNRESOLVED',
];

/** No further transitions: SUCCESSFUL, FAILED or CANCELED. */
export function isPaymentStatusFinal(status: PaymentStatus | null): boolean {
  return status === 'SUCCESSFUL' || status === 'FAILED' || status === 'CANCELED';
}

/** No further transitions: SUCCESSFUL, FAILED or REFUNDED. */
export function isTransferStatusFinal(status: TransferStatus | null): boolean {
  return status === 'SUCCESSFUL' || status === 'FAILED' || status === 'REFUNDED';
}

/**
 * A collection (payment) as returned by the API. Documented fields are typed;
 * `raw` keeps the full payload for forward-compatibility.
 */
export interface Payment {
  publicId: string;
  amount: number | string | null;
  fees: string | null;
  currency: string | null;
  phoneNumber: string | null;
  country: string | null;
  operator: string | null;
  channel: string | null;
  /** `null` when the API returns a status this SDK version does not know. */
  status: PaymentStatus | null;
  orderId: string | null;
  providerTransactionId: string | null;
  orderData: Record<string, unknown> | null;
  reason: string | null;
  createdAt: string | null;
  raw: Record<string, unknown>;
}

/**
 * A disbursement (transfer) as returned by the API. Documented fields are typed;
 * `raw` keeps the full payload for forward-compatibility.
 */
export interface Transfer {
  publicId: string;
  amount: number | string | null;
  fees: string | null;
  currency: string | null;
  phoneNumber: string | null;
  country: string | null;
  operator: string | null;
  channel: string | null;
  /** `null` when the API returns a status this SDK version does not know. */
  status: TransferStatus | null;
  orderId: string | null;
  providerTransactionId: string | null;
  orderData: Record<string, unknown> | null;
  reason: string | null;
  createdAt: string | null;
  raw: Record<string, unknown>;
}

/**
 * The merchant wallet balance for a country.
 *
 * Fiat wallets fill `currency` + `available`/`total`/`holds` (decimal strings).
 * Crypto (`cc`) instead fills `balances`, one entry per asset/network.
 */
export interface Balance {
  country: string | null;
  currency: string | null;
  available: string | null;
  total: string | null;
  holds: string | null;
  balances: Array<Record<string, unknown>> | null;
  raw: Record<string, unknown>;
}

export interface Pagination {
  currentPage: number | null;
  lastPage: number | null;
  perPage: number | null;
  total: number | null;
}

export interface PaymentList {
  data: Payment[];
  meta: Pagination | null;
}

export interface TransferList {
  data: Transfer[];
  meta: Pagination | null;
}

/** Per-call options; `country` overrides the client default for this call. */
export interface CallOptions {
  country?: string;
}

/** List/filter query parameters (null/undefined values are dropped). */
export type ListFilters = Record<string, string | number | boolean | null | undefined>;

export interface PaymentCreateParams {
  operator: string;
  phone_number: string;
  amount: number | string;
  order: Record<string, unknown>;
  /** Only for synchronous-OTP operators (e.g. Orange). */
  otp?: string;
  [key: string]: unknown;
}

export interface TransferCreateParams {
  operator: string;
  phone_number: string;
  amount: number | string;
  order: Record<string, unknown>;
  ignore_double_spend_risk?: boolean;
  [key: string]: unknown;
}
