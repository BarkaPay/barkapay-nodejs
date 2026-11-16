import { describe, expect, it } from 'vitest';

import {
  ApiError,
  AuthenticationError,
  AuthorizationError,
  ConflictError,
  InsufficientBalanceError,
  NetworkError,
  NotFoundError,
  BarkaPay,
  BarkaPayError,
  PaymentFailedError,
  RateLimitError,
  ServerError,
  ServiceUnavailableError,
  TransferFailedError,
  ValidationError,
} from '../src/index';
import type { BarkaPayResponse } from '../src/http';
import { FakeFetch, jsonResponse } from './fakeFetch';

function clientReturning(response: BarkaPayResponse | Error, maxRetries = 0): BarkaPay {
  return new BarkaPay({
    apiKey: 'k:s',
    country: 'bf',
    maxRetries,
    fetch: new FakeFetch([response]).fn,
  });
}

const PAYMENT = {
  operator: 'ORANGE',
  phone_number: '74123456',
  amount: 100,
  order: { id: 'O-1' },
};

describe('error mapping', () => {
  it('maps 422 to ValidationError and exposes the field errors', async () => {
    const client = clientReturning(
      jsonResponse(422, {
        status: 'failed',
        code: 'validation_error',
        message: 'The `operator` field is required.',
        request_id: 'rid-1',
        errors: { operator: ['The `operator` field is required.'] },
      }),
    );

    const error = await client.payments.create(PAYMENT).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ValidationError);
    expect(error).toMatchObject({
      name: 'ValidationError',
      code: 'validation_error',
      httpStatus: 422,
      requestId: 'rid-1',
      errors: { operator: ['The `operator` field is required.'] },
      data: null,
      retryAfter: null,
    });
  });

  it('maps a malformed-body 400 (invalid_input) to ValidationError', async () => {
    const client = clientReturning(
      jsonResponse(400, {
        status: 'failed',
        code: 'invalid_input',
        message: 'Malformed JSON body.',
      }),
    );

    await expect(client.payments.create(PAYMENT)).rejects.toBeInstanceOf(ValidationError);
  });

  it.each([
    ['invalid_api_key', 401],
    ['incorrect_credentials', 401],
    ['unauthenticated', 401],
  ])('maps %s to AuthenticationError', async (code, status) => {
    const client = clientReturning(
      jsonResponse(status, { status: 'failed', code, message: 'no' }),
    );

    await expect(client.me()).rejects.toBeInstanceOf(AuthenticationError);
  });

  it.each([
    ['unauthorized', 403],
    ['ip_not_allowed', 403],
    ['merchant_closed', 410],
    ['merchant_suspended', 451],
  ])('maps %s (HTTP %i) to AuthorizationError', async (code, status) => {
    const client = clientReturning(
      jsonResponse(status, { status: 'failed', code, message: 'no' }),
    );

    await expect(client.me()).rejects.toBeInstanceOf(AuthorizationError);
  });

  it('maps 404 to NotFoundError — unknown or closed country included', async () => {
    const client = clientReturning(
      jsonResponse(404, {
        status: 'error',
        code: 'resource_not_found',
        message: "Unknown country code 'ci'.",
      }),
    );

    await expect(client.ping('ci')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('maps 409 duplicate_transaction to ConflictError', async () => {
    const client = clientReturning(
      jsonResponse(409, {
        status: 'failed',
        code: 'duplicate_transaction',
        message: 'A payment with the same order ID already exists.',
      }),
    );

    await expect(
      client.transfers.create({ ...PAYMENT, order: { id: 'O-1', unique: true } }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('maps 429 to RateLimitError with retryAfter', async () => {
    const client = clientReturning(
      jsonResponse(
        429,
        { status: 'error', code: 'too_many_requests', message: 'slow down' },
        { 'Retry-After': '42' },
      ),
    );

    const error = await client.balance.get().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RateLimitError);
    expect((error as RateLimitError).retryAfter).toBe(42);
  });

  it('maps 400 insufficient_balance to InsufficientBalanceError', async () => {
    const client = clientReturning(
      jsonResponse(400, {
        status: 'failed',
        code: 'insufficient_balance',
        message: 'Insufficient balance for this transfer. Top up your wallet and retry.',
      }),
    );

    const error = await client.transfers.create(PAYMENT).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(InsufficientBalanceError);
    expect((error as ApiError).httpStatus).toBe(400);
  });

  it('maps 424 payment_failed to PaymentFailedError and exposes the FAILED payment', async () => {
    const client = clientReturning(
      jsonResponse(424, {
        status: 'failed',
        code: 'payment_failed',
        message: 'Payer has insufficient funds.',
        data: {
          payment: {
            public_id: '0198d4a2-1b2c-7d3e-8f40-5a6b7c8d9e0f',
            amount: 10000,
            phone_number: '74123456',
            country: 'BF',
            operator: 'ORANGE',
            order_id: 'O-1',
            fees: '150.00',
            currency: 'XOF',
            status: 'FAILED',
            reason: 'Payer has insufficient funds.',
            reason_code: 'payer_insufficient_funds',
            provider_reason: 'Solde insuffisant',
          },
        },
      }),
    );

    const error = await client.payments.create(PAYMENT).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PaymentFailedError);
    const failed = error as PaymentFailedError;
    expect(failed.httpStatus).toBe(424);
    expect(failed.message).toBe('Payer has insufficient funds.');
    expect(failed.payment).toMatchObject({
      object: 'payment',
      publicId: '0198d4a2-1b2c-7d3e-8f40-5a6b7c8d9e0f',
      status: 'FAILED',
      reasonCode: 'payer_insufficient_funds',
      providerReason: 'Solde insuffisant',
      orderId: 'O-1',
    });
    expect(failed.transfer).toBeNull();
    expect(failed.data).toHaveProperty('payment');
  });

  it('maps 424 transfer_failed to TransferFailedError and exposes the FAILED transfer', async () => {
    const client = clientReturning(
      jsonResponse(424, {
        status: 'failed',
        code: 'transfer_failed',
        message: 'Recipient account is invalid.',
        data: {
          transfer: {
            public_id: 'tr-1',
            status: 'FAILED',
            fees: 0,
            reason_code: 'recipient_invalid',
          },
        },
      }),
    );

    const error = await client.transfers.create(PAYMENT).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TransferFailedError);
    expect((error as TransferFailedError).transfer).toMatchObject({
      object: 'transfer',
      publicId: 'tr-1',
      status: 'FAILED',
      fees: '0',
      reasonCode: 'recipient_invalid',
    });
    expect((error as TransferFailedError).payment).toBeNull();
  });

  it('maps 503 operator_unavailable to ServiceUnavailableError, snapshot included', async () => {
    const client = clientReturning(
      jsonResponse(
        503,
        {
          status: 'failed',
          code: 'operator_unavailable',
          message: 'Operator service unavailable.',
          data: {
            payment: {
              public_id: 'p-503',
              status: 'FAILED',
              reason_code: 'operator_unavailable',
            },
          },
        },
        { 'Retry-After': '30' },
      ),
      2, // retries enabled — a create must still not be replayed
    );

    const error = await client.payments.create(PAYMENT).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ServiceUnavailableError);
    expect((error as ApiError).code).toBe('operator_unavailable');
    expect((error as ApiError).retryAfter).toBe(30);
    expect((error as ApiError).payment?.publicId).toBe('p-503');
  });

  it.each([
    ['internal_error', 500],
    ['external_service_error', 500],
    ['', 502],
  ])('maps %j (HTTP %i) to ServerError', async (code, status) => {
    const client = clientReturning(
      jsonResponse(status, { status: 'error', code, message: 'boom' }),
    );

    await expect(client.payments.create(PAYMENT)).rejects.toBeInstanceOf(ServerError);
  });

  it('keeps a 405 (which the API labels internal_error) out of ServerError', async () => {
    const client = clientReturning(
      jsonResponse(405, {
        status: 'error',
        code: 'internal_error',
        message:
          'The PUT method is not supported for route v1/ping. Supported methods: GET, HEAD.',
      }),
    );

    const error = await client.ping().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).not.toBeInstanceOf(ServerError);
    expect((error as ApiError).httpStatus).toBe(405);
  });

  it('falls back on the HTTP status when the code is unknown', async () => {
    const client = clientReturning(
      jsonResponse(409, { status: 'failed', code: 'some_future_code', message: 'x' }),
    );

    await expect(client.ping()).rejects.toBeInstanceOf(ConflictError);
  });

  it('wraps a transport failure as NetworkError', async () => {
    const client = clientReturning(new Error('connection refused'), 0);

    const error = await client.ping().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NetworkError);
    expect((error as NetworkError).timedOut).toBe(false);
  });

  it('makes every SDK error catchable as BarkaPayError, with a proper name', async () => {
    const client = clientReturning(
      jsonResponse(404, { status: 'failed', code: 'resource_not_found', message: 'x' }),
    );

    const error = await client.payments.get('missing').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BarkaPayError);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).name).toBe('NotFoundError');
    expect((error as Error).stack).toContain('NotFoundError');
  });

  it('builds an error straight from an envelope (public helper)', () => {
    const error = ApiError.fromEnvelope(
      429,
      { code: 'too_many_requests', message: 'slow' },
      'fallback-id',
      9,
    );

    expect(error).toBeInstanceOf(RateLimitError);
    expect(error).toMatchObject({ requestId: 'fallback-id', retryAfter: 9 });
    expect(ApiError.fromEnvelope(418, {}).message).toBe('barkapay API error (HTTP 418).');
  });
});
