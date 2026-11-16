// ---------------------------------------------------------------------------
// Statuses
// ---------------------------------------------------------------------------

/** Lifecycle of a collection (payment). */
export type PaymentStatus =
  | 'CREATED'
  | 'AWAITING_OTP'
  | 'QUEUED_FOR_PROCESSING'
  | 'PROCESSING_OPERATOR'
  | 'PROCESSING_SYSTEM'
  | 'SUCCESSFUL'
  | 'FAILED'
  | 'EXPIRED'
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
  | 'UNRESOLVED'
  | 'UNCERTAIN';

/** Lifecycle of a payment link. */
export type PaymentLinkStatus =
  'active' | 'paused' | 'paid' | 'expired' | 'canceled' | 'admin_blocked';

export const PAYMENT_STATUSES: readonly PaymentStatus[] = [
  'CREATED',
  'AWAITING_OTP',
  'QUEUED_FOR_PROCESSING',
  'PROCESSING_OPERATOR',
  'PROCESSING_SYSTEM',
  'SUCCESSFUL',
  'FAILED',
  'EXPIRED',
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
  'UNCERTAIN',
];

export const PAYMENT_LINK_STATUSES: readonly PaymentLinkStatus[] = [
  'active',
  'paused',
  'paid',
  'expired',
  'canceled',
  'admin_blocked',
];

/** No further transitions: SUCCESSFUL, FAILED, EXPIRED or CANCELED. */
export function isPaymentStatusFinal(status: PaymentStatus | null): boolean {
  return (
    status === 'SUCCESSFUL' ||
    status === 'FAILED' ||
    status === 'EXPIRED' ||
    status === 'CANCELED'
  );
}

/**
 * No further transitions: SUCCESSFUL, FAILED or REFUNDED. `UNCERTAIN` is NOT
 * final: the operator outcome is unknown and the verdict arrives by webhook.
 */
export function isTransferStatusFinal(status: TransferStatus | null): boolean {
  return status === 'SUCCESSFUL' || status === 'FAILED' || status === 'REFUNDED';
}

// ---------------------------------------------------------------------------
// Failure reasons
// ---------------------------------------------------------------------------

/** The stable failure codes published by the API in `reason_code`. */
export type KnownReasonCode =
  | 'payer_insufficient_funds'
  | 'payer_refused'
  | 'payer_unreachable'
  | 'invalid_otp'
  | 'otp_expired'
  | 'expired'
  | 'recipient_invalid'
  | 'operator_unavailable'
  | 'operator_timeout'
  | 'unconfirmed_after_window'
  | 'payment_not_completed'
  | 'amount_out_of_bounds'
  | 'duplicate'
  | 'provider_float_insufficient'
  | 'internal_error'
  | 'unknown';

/**
 * A failure code. The catalogue only grows: codes this SDK version does not
 * know yet are passed through as plain strings.
 */
export type ReasonCode = KnownReasonCode | (string & {});

export const REASON_CODES: readonly KnownReasonCode[] = [
  'payer_insufficient_funds',
  'payer_refused',
  'payer_unreachable',
  'invalid_otp',
  'otp_expired',
  'expired',
  'recipient_invalid',
  'operator_unavailable',
  'operator_timeout',
  'unconfirmed_after_window',
  'payment_not_completed',
  'amount_out_of_bounds',
  'duplicate',
  'provider_float_insufficient',
  'internal_error',
  'unknown',
];

// ---------------------------------------------------------------------------
// Resources
// ---------------------------------------------------------------------------

/**
 * A collection (payment) as returned by the API. Documented fields are typed;
 * `raw` keeps the full payload for forward-compatibility.
 */
export interface Payment {
  /** Discriminant — always `'payment'`. */
  object: 'payment';
  publicId: string;
  amount: number | string | null;
  /** Fees charged to you, as a decimal string (e.g. `"6.25"`). */
  fees: string | null;
  currency: string | null;
  phoneNumber: string | null;
  country: string | null;
  operator: string | null;
  /** `api` (created through the API) or `hosted` (paid through a payment link). */
  channel: string | null;
  /** `null` when the API returns a status this SDK version does not know (see `raw.status`). */
  status: PaymentStatus | null;
  /** Your reference (`order.id` at creation). */
  orderId: string | null;
  /** The operator's transaction id, once the operator has confirmed. */
  providerTransactionId: string | null;
  /** The operator-side handle of this attempt (OTP transaction, checkout session…). */
  providerReference: string | null;
  orderData: Record<string, unknown> | null;
  /** The `PL-…` id of the payment link this payment was made through, if any. */
  linkPublicId: string | null;
  /** Human-readable failure phrase (English), `null` unless the payment failed. */
  reason: string | null;
  /** Stable, machine-actionable failure code — branch on this, not on `reason`. */
  reasonCode: ReasonCode | null;
  /** The operator's own sentence, for support/debugging — not contractual. */
  providerReason: string | null;
  /** Page the payer must open to approve the payment (redirect-based operators such as Wave). */
  redirectUrl: string | null;
  createdAt: string | null;
  raw: Record<string, unknown>;
}

/**
 * A disbursement (transfer) as returned by the API. Documented fields are typed;
 * `raw` keeps the full payload for forward-compatibility.
 */
export interface Transfer {
  /** Discriminant — always `'transfer'`. */
  object: 'transfer';
  publicId: string;
  amount: number | string | null;
  /** Fees charged to you, as a decimal string (e.g. `"6.25"`). */
  fees: string | null;
  currency: string | null;
  phoneNumber: string | null;
  country: string | null;
  operator: string | null;
  channel: string | null;
  /** `null` when the API returns a status this SDK version does not know (see `raw.status`). */
  status: TransferStatus | null;
  /** Your reference (`order.id` at creation). */
  orderId: string | null;
  /** The operator's transaction id, once the operator has confirmed. */
  providerTransactionId: string | null;
  /** The operator-side handle of this payout — what appears on the operator statement. */
  providerReference: string | null;
  orderData: Record<string, unknown> | null;
  /** Human-readable failure phrase (English), `null` unless the transfer failed. */
  reason: string | null;
  /** Stable, machine-actionable failure code — branch on this, not on `reason`. */
  reasonCode: ReasonCode | null;
  /** The operator's own sentence, for support/debugging — not contractual. */
  providerReason: string | null;
  createdAt: string | null;
  raw: Record<string, unknown>;
}

/**
 * The merchant wallet balance for a country: `currency` plus
 * `available` / `total` / `holds` as decimal strings (e.g. `"150000.00"`).
 */
export interface Balance {
  country: string | null;
  currency: string | null;
  available: string | null;
  total: string | null;
  holds: string | null;
  /** Per-asset breakdown, for multi-asset wallets only — `null` for mobile-money wallets. */
  balances: Array<Record<string, unknown>> | null;
  raw: Record<string, unknown>;
}

export interface PaymentLinkAmount {
  /** `fixed` (one price), `open` (the payer chooses) or `range` (between `min` and `max`). */
  type: 'fixed' | 'open' | 'range' | (string & {}) | null;
  value: string | null;
  min: string | null;
  max: string | null;
  currency: string | null;
}

export interface PaymentLinkStats {
  /** Number of SUCCESSFUL payments made through the link (all countries). */
  paymentsCount: number | null;
  /** Total collected through the link, as a decimal string. */
  totalCollected: string | null;
}

/**
 * A payment link: a durable page on the barkapay-hosted checkout where your
 * customer picks an operator and pays. Share its `url`.
 */
export interface PaymentLink {
  /** Discriminant — always `'payment_link'`. */
  object: 'payment_link';
  /** The `PL-…` identifier. */
  publicId: string;
  /** The 13-character public slug (last segment of `url`). */
  slug: string | null;
  /** The checkout URL to share with your customer. */
  url: string | null;
  /** `null` when the API returns a status this SDK version does not know (see `raw.status`). */
  status: PaymentLinkStatus | null;
  /** `api` (created through the API) or `ui` (created from the dashboard). */
  source: string | null;
  /** `single` (closed by the first successful payment) or `multi` (reusable). */
  usage: 'single' | 'multi' | (string & {}) | null;
  amount: PaymentLinkAmount;
  title: string | null;
  description: string | null;
  /** Your order reference, as sent at creation (`{ id, data? }`). */
  order: Record<string, unknown> | null;
  redirect: { successUrl: string | null; cancelUrl: string | null } | null;
  restrictions: { countries: string[] | null; operators: string[] | null } | null;
  payer: {
    fullName: string | null;
    email: string | null;
    phone: string | null;
    locale: string | null;
  } | null;
  /** Fields the checkout asks the payer for: `{ full_name?, email?, city?, motif? }` → `required | optional | off`. */
  collect: Record<string, unknown>;
  /** Whether the payment-request email is sent to `payer.email`. */
  notifyEmailInvoice: boolean | null;
  expiresAt: string | null;
  stats: PaymentLinkStats;
  /** For a `single` link that has been paid: the payment that closed it. */
  paidByPaymentPublicId: string | null;
  createdAt: string | null;
  raw: Record<string, unknown>;
}

/** The link summary returned alongside {@link PaymentLinkPaymentList}. */
export interface PaymentLinkSummary {
  publicId: string;
  slug: string | null;
  status: PaymentLinkStatus | null;
  stats: PaymentLinkStats;
}

// ---------------------------------------------------------------------------
// Lists
// ---------------------------------------------------------------------------

export interface Pagination {
  currentPage: number | null;
  /** Not returned by `paymentLinks.list` — compute it from `total` / `perPage`. */
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

export interface PaymentLinkList {
  data: PaymentLink[];
  meta: Pagination | null;
}

/** Payments made through one payment link, in the country queried. */
export interface PaymentLinkPaymentList {
  data: Payment[];
  meta: Pagination | null;
  /** Global summary of the link (its `stats` span every country). */
  paymentLink: PaymentLinkSummary | null;
}

// ---------------------------------------------------------------------------
// Call options & query parameters
// ---------------------------------------------------------------------------

/** Per-call options; `country` overrides the client default for this call. */
export interface CallOptions {
  country?: string;
}

/** List/filter query parameters (null/undefined values are dropped). */
export type ListFilters = Record<string, string | number | boolean | null | undefined>;

/** Comparison used with the `amount` filter. */
export type AmountOperator = '<' | '=' | '>' | '<=' | '>=';

/** Filters of `payments.list` (newest first, 50 per page by default). */
export interface PaymentListParams extends ListFilters {
  status?: PaymentStatus | (string & {});
  operator?: string;
  phone_number?: string;
  /** `api` or `hosted`. */
  channel?: string;
  order_id?: string;
  /** Only applied together with `amount_operator`. */
  amount?: number | string;
  amount_operator?: AmountOperator;
  /** `YYYY-MM-DD` (or any date). Only applied together with `to_date`. */
  from_date?: string;
  /** `YYYY-MM-DD` (or any date). Only applied together with `from_date`. */
  to_date?: string;
  page?: number;
  /** 1–200, default 50. */
  per_page?: number;
}

/** Filters of `transfers.list` (newest first, 50 per page by default). */
export interface TransferListParams extends ListFilters {
  status?: TransferStatus | (string & {});
  operator?: string;
  phone_number?: string;
  channel?: string;
  order_id?: string;
  /** Only applied together with `amount_operator`. */
  amount?: number | string;
  amount_operator?: AmountOperator;
  /** `YYYY-MM-DD` (or any date). Only applied together with `to_date`. */
  from_date?: string;
  /** `YYYY-MM-DD` (or any date). Only applied together with `from_date`. */
  to_date?: string;
  page?: number;
  /** 1–200, default 50. */
  per_page?: number;
}

/** Filters of `paymentLinks.list` (newest first, 25 per page by default). */
export interface PaymentLinkListParams extends ListFilters {
  /** One status, or several separated by commas (e.g. `"active,paid"`). */
  status?: PaymentLinkStatus | (string & {});
  usage?: 'single' | 'multi' | (string & {});
  /** `api` or `ui`. */
  source?: string;
  page?: number;
  /** 1–100, default 25. */
  per_page?: number;
}

/** Filters of `paymentLinks.listPayments` (newest first, 25 per page by default). */
export interface PaymentLinkPaymentListParams extends ListFilters {
  status?: PaymentStatus | (string & {});
  operator?: string;
  phone_number?: string;
  /** `YYYY-MM-DD` — payments created on or after that day. */
  from_date?: string;
  /** `YYYY-MM-DD` — payments created on or before that day. */
  to_date?: string;
  page?: number;
  /** 1–100, default 25. */
  per_page?: number;
}

// ---------------------------------------------------------------------------
// Request bodies
// ---------------------------------------------------------------------------

/** Your order reference, attached to a payment or a transfer. */
export interface OrderParams {
  /** Your own reference (max 255 characters). Look operations up with it later. */
  id: string;
  /**
   * `true` makes the API refuse (409 `duplicate_transaction`) any second
   * operation carrying the same `id` — the way to make a create call safe to
   * send again after a timeout.
   */
  unique?: boolean;
  /** Up to 20 free-form string values echoed back in `orderData` and webhooks. */
  data?: Record<string, string>;
  [key: string]: unknown;
}

export interface PaymentCreateParams {
  /** `direct` (default) charges the payer now. See {@link HostedPaymentCreateParams} for `hosted`. */
  channel?: 'direct';
  /** Operator code, e.g. `ORANGE`, `MOOV`, `MTN`, `WAVE` (see `operators.info()`). */
  operator: string;
  phone_number: string;
  /** In the country's currency; at most 2 decimals. */
  amount: number | string;
  /** `{ id, unique?, data? }` — see {@link OrderParams}. */
  order: OrderParams | Record<string, unknown>;
  /**
   * Only for operators that take the payer's OTP at creation (e.g. Orange).
   * Always a string: a leading zero is significant.
   */
  otp?: string;
  [key: string]: unknown;
}

export interface TransferCreateParams {
  /** Operator code, e.g. `ORANGE`, `MOOV`, `MTN`, `WAVE` (see `operators.info()`). */
  operator: string;
  phone_number: string;
  /** In the country's currency; at most 2 decimals. */
  amount: number | string;
  /** `{ id, unique?, data? }` — see {@link OrderParams}. */
  order: OrderParams | Record<string, unknown>;
  /**
   * Bypass the guard that refuses (409) a transfer carrying the same order id,
   * recipient and amount as one sent in the last 60 seconds. Leave unset
   * unless you really mean to pay twice.
   */
  ignore_double_spend_risk?: boolean;
  [key: string]: unknown;
}

/** What the hosted checkout asks the payer for. */
export type PaymentLinkCollectMode = 'required' | 'optional' | 'off';

export interface PaymentLinkCreateParams {
  /** Shown to the payer (max 120 characters). */
  title: string;
  amount: {
    type: 'fixed' | 'open' | 'range';
    /** Defaults to `XOF`. */
    currency?: string;
    /** Required for `fixed`. */
    value?: number | string;
    /** Required for `range`. */
    min?: number | string;
    /** Required for `range`. */
    max?: number | string;
  };
  description?: string | null;
  /** `single` (default): closed by the first successful payment. `multi`: reusable. */
  usage?: 'single' | 'multi';
  /** Your reference, copied onto every payment made through the link. */
  order?: { id: string; data?: Record<string, unknown> } | null;
  /** Where the checkout sends the payer afterwards (http/https URLs). */
  redirect?: { success_url?: string | null; cancel_url?: string | null } | null;
  /** Narrow the payer's choices. `countries` defaults to the country you call. */
  restrictions?: { countries?: string[]; operators?: string[] } | null;
  /** A payer you already know — prefills the checkout. */
  payer?: {
    full_name?: string | null;
    email?: string | null;
    phone?: string | null;
    locale?: 'fr' | 'en' | null;
  } | null;
  collect?: {
    full_name?: PaymentLinkCollectMode;
    email?: PaymentLinkCollectMode;
    city?: PaymentLinkCollectMode;
    motif?: PaymentLinkCollectMode;
  };
  /** Email the payment request to `payer.email` on creation. */
  notify_email_invoice?: boolean;
  /** ISO 8601 date-time in the future (a `Date` works too). Omitted: never expires. */
  expires_at?: string | Date | null;
  [key: string]: unknown;
}

/** Only these fields can change after creation; send `null` to clear a nullable one. */
export interface PaymentLinkUpdateParams {
  title?: string;
  description?: string | null;
  /** ISO 8601 date-time in the future (a `Date` works too). */
  expires_at?: string | Date | null;
  redirect?: { success_url?: string | null; cancel_url?: string | null } | null;
  [key: string]: unknown;
}

/**
 * `payments.create({ channel: 'hosted', … })` — instead of charging a payer
 * now, create a payment link and get back a {@link PaymentLink}.
 */
export type HostedPaymentCreateParams = PaymentLinkCreateParams & { channel: 'hosted' };

/**
 * What `payments.create` resolves to: a {@link Payment} (`channel: 'direct'`,
 * the default) or a {@link PaymentLink} (`channel: 'hosted'`). Tell them
 * apart with `result.object`.
 */
export type PaymentCreateResult = Payment | PaymentLink;

// ---------------------------------------------------------------------------
// System & operators (raw API shapes)
// ---------------------------------------------------------------------------

/** `ping()` — liveness of the API for a country. */
export interface PingResult {
  version?: string;
  documentation?: string | null;
  [key: string]: unknown;
}

/** `me()` — the merchant and API application behind the key. */
export interface MeResult {
  merchant?: {
    public_id?: string;
    name?: string;
    country?: string;
    email?: string;
    [key: string]: unknown;
  };
  api_app?: {
    public_id?: string;
    name?: string;
    label?: string;
    scopes?: string[];
    /** The country × operator × service matrix enabled for the application. */
    permissions?: Array<Record<string, unknown>>;
    allowed_countries?: string[];
    allowed_services?: string;
    can_perform_transfers?: boolean;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface OperatorServiceAvailability {
  /** `operational`, `degraded` or `down`. */
  status?: 'operational' | 'degraded' | 'down' | (string & {});
  reason?: string | null;
  /** When this availability was last published — `null` when it never was. */
  updated_at?: string | null;
  [key: string]: unknown;
}

/** `operators.availability()` — keyed by ISO-3 country, then operator, then service. */
export interface OperatorsAvailability {
  operational?: boolean;
  services?: Record<
    string,
    Record<
      string,
      {
        payment?: OperatorServiceAvailability;
        transfer?: OperatorServiceAvailability;
        [key: string]: unknown;
      }
    >
  >;
  [key: string]: unknown;
}

export interface OperatorInfo {
  /** Whether a payment with this operator involves an OTP typed by the payer. */
  otp_required?: boolean;
  /** What to tell the payer (e.g. the USSD code that generates the OTP). */
  payment_instructions?: string;
  /** Seconds the payer has to complete the payment; `null` when unknown. */
  pay_delay?: number | null;
  min_amount?: number;
  max_amount?: number;
  [key: string]: unknown;
}

/** `operators.info()` — the authoritative operator list, keyed by ISO-3 country then operator. */
export interface OperatorsInfo {
  operators?: Record<string, Record<string, OperatorInfo>>;
  supported_countries?: string[];
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Webhooks (raw API shapes)
// ---------------------------------------------------------------------------

interface WebhookEventBase {
  /** Stable across re-deliveries of the same event — deduplicate on it. */
  event_id: string;
  /** When the event was created (ISO 8601). */
  timestamp: string;
  public_id: string;
  amount?: number | string | null;
  /** Decimal string (e.g. `"6.25"`). */
  fees?: string | null;
  phone_number?: string | null;
  country?: string | null;
  order_id?: string | null;
  order_data?: Record<string, unknown> | null;
  provider_transaction_id?: string | null;
  reason?: string | null;
  reason_code?: ReasonCode | null;
  provider_reason?: string | null;
  app_label?: string | null;
  [key: string]: unknown;
}

/** Body of a `payment.succeeded` / `payment.failed` / `payment.expired` delivery. */
export interface PaymentWebhookEvent extends WebhookEventBase {
  type: 'payment';
  /** `SUCCESSFUL`, `FAILED`, `CANCELED` or `EXPIRED`. */
  status: PaymentStatus | (string & {});
  /** The `PL-…` id when the payment was made through a payment link. */
  link_public_id?: string | null;
}

/** Body of a `transfer.succeeded` / `transfer.failed` delivery. */
export interface TransferWebhookEvent extends WebhookEventBase {
  type: 'transfer';
  /** `SUCCESSFUL`, `FAILED` or `CANCELED`. */
  status: TransferStatus | (string & {});
}

/**
 * A verified webhook body. There is no `event` field: derive the event from
 * `type` + `status` (`payment` + `SUCCESSFUL` = `payment.succeeded`, …).
 */
export type WebhookEvent = PaymentWebhookEvent | TransferWebhookEvent;
