import { describe, expect, it } from 'vitest';

import {
  AuthenticationError,
  ConflictError,
  NetworkError,
  RateLimitError,
  ValidationError,
} from '../src/index';
import { PayHub } from '../src/index';
import { FakeFetch, jsonResponse } from './fakeFetch';
import type { PayHubResponse } from '../src/http';

function clientReturning(response: PayHubResponse | Error, maxRetries = 0): PayHub {
  return new PayHub({
    apiKey: 'k:s',
    country: 'bf',
    maxRetries,
    fetch: new FakeFetch([response]).fn,
  });
}

describe('error mapping', () => {
  it('maps 422 to ValidationError and exposes the field errors', async () => {
    const client = clientReturning(
      jsonResponse(422, {
        status: 'failed',
        code: 'validation_error',
        message: 'The given data was invalid.',
        request_id: 'rid-1',
        errors: { operator: ['Unknown operator.'] },
      }),
    );

    await expect(
      client.payments.create({ operator: 'X', phone_number: '1', amount: 1, order: {} }),
    ).rejects.toMatchObject({
      code: 'validation_error',
      httpStatus: 422,
      requestId: 'rid-1',
    });
  });

  it('exposes ValidationError.errors map', async () => {
    const client = clientReturning(
      jsonResponse(422, {
        status: 'failed',
        code: 'validation_error',
        message: 'invalid',
        errors: { operator: ['Unknown operator.'] },
      }),
    );

    await expect(
      client.payments.create({ operator: 'X', phone_number: '1', amount: 1, order: {} }),
    ).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(ValidationError);
      expect((err as ValidationError).errors).toEqual({ operator: ['Unknown operator.'] });
      return true;
    });
  });

  it('maps 401 to AuthenticationError', async () => {
    const client = clientReturning(
      jsonResponse(401, { status: 'failed', code: 'invalid_api_key', message: 'bad key' }),
    );

    await expect(client.me()).rejects.toBeInstanceOf(AuthenticationError);
  });

  it('maps 409 to ConflictError', async () => {
    const client = clientReturning(
      jsonResponse(409, { status: 'failed', code: 'duplicate_transaction', message: 'dup' }),
    );

    await expect(
      client.transfers.create({ operator: 'X', phone_number: '1', amount: 1, order: {} }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('maps 429 to RateLimitError once retries are exhausted', async () => {
    const client = clientReturning(
      jsonResponse(429, { status: 'error', code: 'too_many_requests', message: 'slow down' }),
      0,
    );

    await expect(client.balance.get()).rejects.toBeInstanceOf(RateLimitError);
  });

  it('wraps a transport failure as NetworkError', async () => {
    const client = clientReturning(new Error('connection refused'), 0);

    await expect(client.ping()).rejects.toBeInstanceOf(NetworkError);
  });
});
