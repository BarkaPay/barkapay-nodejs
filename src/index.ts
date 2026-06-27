export { PayHub, type PayHubOptions } from './client';
export { VERSION } from './version';

export {
  verifyWebhookSignature,
  parseWebhook,
  DEFAULT_TOLERANCE_SECONDS,
} from './webhook';

export type { FetchFn, PayHubRequestInit, PayHubResponse } from './http';

export {
  ApiError,
  AuthenticationError,
  AuthorizationError,
  ConfigurationError,
  ConflictError,
  NetworkError,
  NotFoundError,
  PayHubError,
  RateLimitError,
  ServerError,
  ServiceUnavailableError,
  SignatureVerificationError,
  ValidationError,
  type ApiErrorContext,
} from './errors';

export {
  PAYMENT_STATUSES,
  TRANSFER_STATUSES,
  isPaymentStatusFinal,
  isTransferStatusFinal,
  type Balance,
  type CallOptions,
  type ListFilters,
  type Pagination,
  type Payment,
  type PaymentCreateParams,
  type PaymentList,
  type PaymentStatus,
  type Transfer,
  type TransferCreateParams,
  type TransferList,
  type TransferStatus,
} from './types';

export type { Payments } from './resources/payments';
export type { Transfers } from './resources/transfers';
export type { BalanceResource } from './resources/balance';
export type { Operators } from './resources/operators';
