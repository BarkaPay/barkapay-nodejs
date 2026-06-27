import { isRecord } from './util';

/**
 * Base class for every error the SDK throws — catch this to trap anything from
 * the SDK in one place.
 */
export class PayHubError extends Error {
  constructor(message: string) {
    super(message);
    // Restore the prototype chain + set a useful name across transpile targets.
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** The SDK was constructed or called with invalid arguments. */
export class ConfigurationError extends PayHubError {}

/** The HTTP request never completed (DNS, connection, timeout). No response. */
export class NetworkError extends PayHubError {}

/** A webhook signature could not be verified (bad/stale/malformed/invalid JSON). */
export class SignatureVerificationError extends PayHubError {}

export interface ApiErrorContext {
  code?: string;
  httpStatus?: number;
  requestId?: string | null;
  errors?: Record<string, unknown>;
}

/**
 * Base class for every error returned by the PayHub API (any response with the
 * standard error envelope or a non-2xx status). Subclasses map the most common
 * cases so you can catch them precisely.
 */
export class ApiError extends PayHubError {
  /** Machine-readable code from the envelope (e.g. `validation_error`). */
  readonly code: string;
  readonly httpStatus: number;
  /** Correlation id echoed by the API — quote it to support. */
  readonly requestId: string | null;
  /** Field-level details (validation) or context. */
  readonly errors: Record<string, unknown>;

  constructor(message: string, context: ApiErrorContext = {}) {
    super(message);
    this.code = context.code ?? '';
    this.httpStatus = context.httpStatus ?? 0;
    this.requestId = context.requestId ?? null;
    this.errors = context.errors ?? {};
  }

  /** Build the most specific exception for an error envelope. */
  static fromEnvelope(
    httpStatus: number,
    envelope: Record<string, unknown>,
    fallbackRequestId: string | null = null,
  ): ApiError {
    const code = typeof envelope.code === 'string' ? envelope.code : '';
    const rawMessage = envelope.message;
    const message =
      typeof rawMessage === 'string' && rawMessage !== ''
        ? rawMessage
        : `PayHub API error (HTTP ${httpStatus}).`;
    const requestId =
      typeof envelope.request_id === 'string' ? envelope.request_id : fallbackRequestId;
    const errors = isRecord(envelope.errors) ? envelope.errors : {};

    const Ctor = classFor(code, httpStatus);

    return new Ctor(message, { code, httpStatus, requestId, errors });
  }
}

/** 401 — bad credentials. */
export class AuthenticationError extends ApiError {}
/** 403/410/451 — not allowed. */
export class AuthorizationError extends ApiError {}
/** 422 — request validation failed (`errors` holds the field → messages map). */
export class ValidationError extends ApiError {}
/** 404 — resource not found. */
export class NotFoundError extends ApiError {}
/** 409 — duplicate / already exists. */
export class ConflictError extends ApiError {}
/** 429 — rate limited. */
export class RateLimitError extends ApiError {}
/** 503 — service unavailable (retryable). */
export class ServiceUnavailableError extends ApiError {}
/** 5xx — server error. */
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
    case 'service_unavailable':
    case 'operator_unavailable':
      return ServiceUnavailableError;
    default:
      break;
  }

  if (httpStatus === 401) return AuthenticationError;
  if (httpStatus === 403) return AuthorizationError;
  if (httpStatus === 404) return NotFoundError;
  if (httpStatus === 409) return ConflictError;
  if (httpStatus === 422) return ValidationError;
  if (httpStatus === 429) return RateLimitError;
  if (httpStatus === 503) return ServiceUnavailableError;
  if (httpStatus >= 500) return ServerError;

  return ApiError;
}
