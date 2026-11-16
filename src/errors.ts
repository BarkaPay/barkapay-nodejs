import { hydratePayment, hydrateTransfer } from './dto';
import type { Payment, Transfer } from './types';
import { coerceObject, isRecord } from './util';

/**
 * Base class for every error the SDK throws — catch this to trap anything from
 * the SDK in one place.
 */
export class PayHubError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    // Restore the prototype chain + set a useful name across transpile targets.
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** The SDK was constructed or called with invalid arguments. */
export class ConfigurationError extends PayHubError {}

/**
 * The HTTP request never produced a usable response (DNS, connection reset,
 * timeout, body cut mid-stream).
 *
 * ⚠️ For a request that moves money (`payments.create`, `transfers.create`,
 * `payments.confirmOtp`) this does NOT mean "nothing happened": the API may
 * have processed it. Look the operation up by your order id
 * (`list({ order_id })`) before sending it again.
 */
export class NetworkError extends PayHubError {
  /** `true` when the SDK gave up because `timeoutMs` elapsed. */
  readonly timedOut: boolean;

  constructor(message: string, options: { cause?: unknown; timedOut?: boolean } = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.timedOut = options.timedOut ?? false;
  }
}

/** A webhook signature could not be verified (bad/stale/malformed/invalid JSON). */
export class SignatureVerificationError extends PayHubError {}

export interface ApiErrorContext {
  code?: string;
  httpStatus?: number;
  requestId?: string | null;
  errors?: Record<string, unknown>;
  /** The `data` member of the error envelope, when the API sends one. */
  data?: Record<string, unknown> | null;
  /** Seconds to wait before retrying, from the `Retry-After` response header. */
  retryAfter?: number | null;
}

/**
 * Base class for every error returned by the barkapay API (any response with
 * the standard error envelope or a non-2xx status). Subclasses map the most
 * common cases so you can catch them precisely.
 */
export class ApiError extends PayHubError {
  /** Machine-readable code from the envelope (e.g. `validation_error`). */
  readonly code: string;
  readonly httpStatus: number;
  /** Correlation id echoed by the API — quote it to support. */
  readonly requestId: string | null;
  /** Field-level details (validation): `{ field: [messages] }`. */
  readonly errors: Record<string, unknown>;
  /**
   * The `data` member of the error envelope. A payment or transfer the
   * operator refused comes back here as a `FAILED` snapshot — see
   * {@link ApiError.payment} / {@link ApiError.transfer}.
   */
  readonly data: Record<string, unknown> | null;
  /** Seconds to wait before retrying (`Retry-After` header), when the API says so. */
  readonly retryAfter: number | null;

  constructor(message: string, context: ApiErrorContext = {}) {
    super(message);
    this.code = context.code ?? '';
    this.httpStatus = context.httpStatus ?? 0;
    this.requestId = context.requestId ?? null;
    this.errors = context.errors ?? {};
    this.data = context.data ?? null;
    this.retryAfter = context.retryAfter ?? null;
  }

  /**
   * The payment snapshot carried by the error, if any. Present when a payment
   * was created and then refused (`payment_failed`, `operator_unavailable`…):
   * it holds the `publicId`, the `FAILED` status and the `reasonCode`.
   */
  get payment(): Payment | null {
    const row = this.data === null ? null : coerceObject(this.data, 'payment');
    return row === null ? null : hydratePayment(row);
  }

  /** The transfer snapshot carried by the error, if any (see {@link ApiError.payment}). */
  get transfer(): Transfer | null {
    const row = this.data === null ? null : coerceObject(this.data, 'transfer');
    return row === null ? null : hydrateTransfer(row);
  }

  /** Build the most specific exception for an error envelope. */
  static fromEnvelope(
    httpStatus: number,
    envelope: Record<string, unknown>,
    fallbackRequestId: string | null = null,
    retryAfter: number | null = null,
  ): ApiError {
    const code = typeof envelope.code === 'string' ? envelope.code : '';
    const rawMessage = envelope.message;
    const message =
      typeof rawMessage === 'string' && rawMessage !== ''
        ? rawMessage
        : `barkapay API error (HTTP ${httpStatus}).`;
    const requestId =
      typeof envelope.request_id === 'string' && envelope.request_id !== ''
        ? envelope.request_id
        : fallbackRequestId;
    const errors = isRecord(envelope.errors) ? envelope.errors : {};
    const data = isRecord(envelope.data) ? envelope.data : null;

    const Ctor = classFor(code, httpStatus);

    return new Ctor(message, { code, httpStatus, requestId, errors, data, retryAfter });
  }
}

/** 401 — bad credentials. */
export class AuthenticationError extends ApiError {}
/** 403/410/451 — not allowed (scope, IP allowlist, suspended or closed merchant). */
export class AuthorizationError extends ApiError {}
/** 422 (or 400 for an unreadable body) — the request is invalid; `errors` holds the field → messages map. */
export class ValidationError extends ApiError {}
/** 404 — resource (or country, or endpoint) not found. */
export class NotFoundError extends ApiError {}
/** 409 — duplicate (`order.unique`, or the same transfer sent again within 60 seconds). */
export class ConflictError extends ApiError {}
/** 429 — rate limited; `retryAfter` says how long to wait. */
export class RateLimitError extends ApiError {}
/** 400 `insufficient_balance` — your barkapay balance does not cover the transfer and its fees. */
export class InsufficientBalanceError extends ApiError {}
/**
 * 424 `payment_failed` — the payer or the operator definitively refused the
 * payment. Final for this attempt: do not retry it as is. `payment` holds the
 * `FAILED` snapshot with its `reasonCode`.
 */
export class PaymentFailedError extends ApiError {}
/**
 * 424 `transfer_failed` — the operator definitively refused the transfer.
 * Final for this attempt. `transfer` holds the `FAILED` snapshot.
 */
export class TransferFailedError extends ApiError {}
/**
 * 503 — `service_unavailable` or `operator_unavailable`.
 *
 * ⚠️ On `payments.create` / `transfers.create` the operation may already
 * exist (`payment` / `transfer` then holds its snapshot): the SDK never
 * re-sends those on its own.
 */
export class ServiceUnavailableError extends ApiError {}
/** Other 5xx — server error (`internal_error`, `external_service_error`). */
export class ServerError extends ApiError {}

type ApiErrorCtor = new (message: string, context?: ApiErrorContext) => ApiError;

function classFor(code: string, httpStatus: number): ApiErrorCtor {
  switch (code) {
    case 'unauthenticated':
    case 'invalid_api_key':
    case 'incorrect_credentials':
      return AuthenticationError;
    case 'unauthorized':
    case 'ip_not_allowed':
    case 'merchant_suspended':
    case 'merchant_closed':
      return AuthorizationError;
    case 'validation_error':
    case 'invalid_input':
      return ValidationError;
    case 'resource_not_found':
      return NotFoundError;
    case 'duplicate_transaction':
    case 'resource_already_exists':
      return ConflictError;
    case 'too_many_requests':
      return RateLimitError;
    case 'insufficient_balance':
      return InsufficientBalanceError;
    case 'payment_failed':
      return PaymentFailedError;
    case 'transfer_failed':
      return TransferFailedError;
    case 'service_unavailable':
    case 'operator_unavailable':
      return ServiceUnavailableError;
    default:
      break;
  }

  if (httpStatus === 401) return AuthenticationError;
  if (httpStatus === 403 || httpStatus === 410 || httpStatus === 451)
    return AuthorizationError;
  if (httpStatus === 404) return NotFoundError;
  if (httpStatus === 409) return ConflictError;
  if (httpStatus === 422) return ValidationError;
  if (httpStatus === 429) return RateLimitError;
  if (httpStatus === 503) return ServiceUnavailableError;
  if (httpStatus >= 500) return ServerError;

  return ApiError;
}
