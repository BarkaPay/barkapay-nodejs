import { describe, expect, it } from 'vitest';

import { PayHub } from '../src/index';
import { FakeFetch, jsonResponse } from './fakeFetch';

describe('PayHub client', () => {
  it('builds a signed, country-scoped request for payments.create', async () => {
    const http = new FakeFetch([
      jsonResponse(201, {
        status: 'success',
        code: 'resource_created',
        data: {
          payment: {
            public_id: 'pay_1',
            status: 'SUCCESSFUL',
            amount: 10000,
            currency: 'XOF',
          },
        },
      }),
    ]);

    const client = new PayHub({
      apiKey: 'pk_live_x:sk_live_y',
      country: 'bf',
      maxRetries: 0,
      fetch: http.fn,
    });

    const payment = await client.payments.create({
      operator: 'ORANGE',
      phone_number: '50123456789',
      amount: 10000,
      order: { id: 'O1' },
    });

    expect(payment.publicId).toBe('pay_1');
    expect(payment.status).toBe('SUCCESSFUL');

    const call = http.lastCall;
    expect(call).toBeDefined();
    expect(call?.init.method).toBe('POST');
    expect(call?.url).toBe('https://hub.barkapay.com/bf/v1/payments');
    expect(call?.init.headers.Authorization).toBe('Bearer pk_live_x:sk_live_y');
    expect(call?.init.headers.Accept).toBe('application/json');
    expect(call?.init.headers['Content-Type']).toBe('application/json');
    expect(call?.init.headers['User-Agent']).toMatch(/^payhub-node\//);
    expect(call?.init.headers['X-Request-Id']).toBeTruthy();

    expect(call?.init.body).toBeDefined();
    const body = JSON.parse(call?.init.body ?? '{}');
    expect(body.operator).toBe('ORANGE');
  });

  it('overrides the country per call', async () => {
    const http = new FakeFetch([jsonResponse(200, { status: 'success', data: {} })]);
    const client = new PayHub({ apiKey: 'k:s', country: 'bf', maxRetries: 0, fetch: http.fn });

    await client.ping('sn');

    expect(http.lastCall?.url).toBe('https://hub.barkapay.com/sn/v1/ping');
  });

  it('forgives an accidental "Bearer " prefix', async () => {
    const http = new FakeFetch([jsonResponse(200, { status: 'success', data: {} })]);
    const client = new PayHub({ apiKey: 'Bearer k:s', country: 'bf', maxRetries: 0, fetch: http.fn });

    await client.ping();

    expect(http.lastCall?.init.headers.Authorization).toBe('Bearer k:s');
  });

  it('accepts keyId + secret passed separately', async () => {
    const http = new FakeFetch([jsonResponse(200, { status: 'success', data: {} })]);
    const client = new PayHub({
      keyId: 'pk_live_x',
      secret: 'sk_live_y',
      country: 'bf',
      maxRetries: 0,
      fetch: http.fn,
    });

    await client.ping();

    expect(http.lastCall?.init.headers.Authorization).toBe('Bearer pk_live_x:sk_live_y');
  });

  it('hydrates a collection, pagination and the query string for list', async () => {
    const http = new FakeFetch([
      jsonResponse(200, {
        status: 'success',
        data: {
          payments: [
            { public_id: 'p1', status: 'SUCCESSFUL' },
            { public_id: 'p2', status: 'FAILED' },
          ],
        },
        meta: { current_page: 1, last_page: 1, per_page: 50, total: 2 },
      }),
    ]);
    const client = new PayHub({ apiKey: 'k:s', country: 'bf', maxRetries: 0, fetch: http.fn });

    const list = await client.payments.list({ status: 'SUCCESSFUL', per_page: 50 });

    expect(list.data).toHaveLength(2);
    expect(list.meta?.total).toBe(2);
    expect(list.data.map((p) => p.publicId)).toEqual(['p1', 'p2']);
    expect(http.lastCall?.url).toContain('status=SUCCESSFUL');
    expect(http.lastCall?.url).toContain('per_page=50');
  });

  it('looks up a payment by id from the data.payments array', async () => {
    const http = new FakeFetch([
      jsonResponse(200, {
        status: 'success',
        data: { payments: [{ public_id: 'pay_42', status: 'PROCESSING_OPERATOR' }] },
      }),
    ]);
    const client = new PayHub({ apiKey: 'k:s', country: 'bf', maxRetries: 0, fetch: http.fn });

    const payment = await client.payments.get('pay_42');

    expect(payment.publicId).toBe('pay_42');
    expect(payment.status).toBe('PROCESSING_OPERATOR');
    expect(http.lastCall?.url).toBe('https://hub.barkapay.com/bf/v1/payments/pay_42');
  });

  it('confirms and resends OTP', async () => {
    const http = new FakeFetch([
      jsonResponse(200, {
        status: 'success',
        data: { payment: { public_id: 'pay_1', status: 'SUCCESSFUL' } },
      }),
      jsonResponse(200, { status: 'success', data: {} }),
    ]);
    const client = new PayHub({ apiKey: 'k:s', country: 'bf', maxRetries: 0, fetch: http.fn });

    const confirmed = await client.payments.confirmOtp('pay_1', '123456');
    expect(confirmed.status).toBe('SUCCESSFUL');
    expect(http.calls[0]?.url).toBe('https://hub.barkapay.com/bf/v1/payments/pay_1/confirm-otp');
    expect(JSON.parse(http.calls[0]?.init.body ?? '{}').otp).toBe('123456');

    await expect(client.payments.resendOtp('pay_1')).resolves.toBeUndefined();
    expect(http.calls[1]?.url).toBe('https://hub.barkapay.com/bf/v1/payments/pay_1/resend-otp');
  });

  it('creates and hydrates a transfer', async () => {
    const http = new FakeFetch([
      jsonResponse(201, {
        status: 'success',
        data: { transfer: { public_id: 'xfer_1', status: 'PROCESSING_OPERATOR', amount: 50000 } },
      }),
    ]);
    const client = new PayHub({ apiKey: 'k:s', country: 'bf', maxRetries: 0, fetch: http.fn });

    const transfer = await client.transfers.create({
      operator: 'ORANGE',
      phone_number: '50123456789',
      amount: 50000,
      order: { id: 'X1' },
    });

    expect(transfer.publicId).toBe('xfer_1');
    expect(transfer.status).toBe('PROCESSING_OPERATOR');
    expect(http.lastCall?.url).toBe('https://hub.barkapay.com/bf/v1/transfers');
  });

  it('gets the balance', async () => {
    const http = new FakeFetch([
      jsonResponse(200, {
        status: 'success',
        data: {
          country: 'BF',
          currency: 'XOF',
          available: '1500.00',
          total: '1500.00',
          holds: '0.00',
        },
      }),
    ]);
    const client = new PayHub({ apiKey: 'k:s', country: 'bf', maxRetries: 0, fetch: http.fn });

    const balance = await client.balance.get();

    expect(balance.available).toBe('1500.00');
    expect(balance.currency).toBe('XOF');
    expect(http.lastCall?.url).toBe('https://hub.barkapay.com/bf/v1/balance');
  });

  it('retries on 503 then succeeds', async () => {
    const http = new FakeFetch([
      jsonResponse(503, { status: 'error', code: 'service_unavailable', message: 'down' }),
      jsonResponse(200, { status: 'success', data: {} }),
    ]);
    const client = new PayHub({ apiKey: 'k:s', country: 'bf', maxRetries: 1, fetch: http.fn });

    await client.ping();

    expect(http.calls).toHaveLength(2);
  });
});
