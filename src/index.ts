export { BarkaPay, type BarkaPayOptions } from './client';
export { VERSION } from './version';

export {
  verifyWebhookSignature,
  parseWebhook,
  DEFAULT_TOLERANCE_SECONDS,
  WEBHOOK_SIGNATURE_HEADER,
  type WebhookPayload,
  type WebhookSignatureHeader,
} from './webhook';

export type {
  FetchFn,
  BarkaPayRequestInit,
  BarkaPayResponse,
  BarkaPayResponseHeaders,
} from './http';

export {
  ApiError,
  AuthenticationError,
  AuthorizationError,
  ConfigurationError,
  ConflictError,
  InsufficientBalanceError,
  NetworkError,
  NotFoundError,
  BarkaPayError,
  PaymentFailedError,
  RateLimitError,
  ServerError,
  ServiceUnavailableError,
  SignatureVerificationError,
  TransferFailedError,
  ValidationError,
  type ApiErrorContext,
} from './errors';

export {
  PAYMENT_LINK_STATUSES,
  PAYMENT_STATUSES,
  REASON_CODES,
  TRANSFER_STATUSES,
  isPaymentStatusFinal,
  isTransferStatusFinal,
  type AmountOperator,
  type Balance,
  type CallOptions,
  type KnownReasonCode,
  type ListFilters,
  type MeResult,
  type OperatorInfo,
  type OperatorServiceAvailability,
  type OperatorsAvailability,
  type OperatorsInfo,
  type OrderParams,
  type Pagination,
  type Payment,
  type PaymentCreateParams,
  type PaymentLink,
  type PaymentLinkAmount,
  type PaymentLinkCollectMode,
  type PaymentLinkCreateParams,
  type PaymentLinkList,
  type PaymentLinkListParams,
  type PaymentLinkPaymentList,
  type PaymentLinkPaymentListParams,
  type PaymentLinkStats,
  type PaymentLinkStatus,
  type PaymentLinkSummary,
  type PaymentLinkUpdateParams,
  type PaymentList,
  type PaymentListParams,
  type PaymentStatus,
  type PaymentWebhookEvent,
  type PingResult,
  type ReasonCode,
  type Transfer,
  type TransferCreateParams,
  type TransferList,
  type TransferListParams,
  type TransferStatus,
  type TransferWebhookEvent,
  type WebhookEvent,
} from './types';

export type { Payments } from './resources/payments';
export type { PaymentLinks } from './resources/paymentLinks';
export type { Transfers } from './resources/transfers';
export type { BalanceResource } from './resources/balance';
export type { Operators } from './resources/operators';
