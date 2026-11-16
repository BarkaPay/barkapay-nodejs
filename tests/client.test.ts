import { describe, expect, it } from 'vitest';

import { BarkaPay } from '../src/index';
import { FakeFetch, jsonResponse } from './fakeFetch';

describe('BarkaPay client', () => {
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

    const client = new BarkaPay({
      apiKey: 'pk_live_x:sk_live_y',
      country: 'bf',
      maxRetries: 0,
      fetch: http.fn,
    });

    const payment = await client.payments.create({
      operator: 'ORANGE',
      phone_number: '74123456',
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
    expect(call?.init.headers['User-Agent']).toMatch(/^barkapay-node\/\d+\.\d+\.\d+/);
    expect(call?.init.headers['X-Request-Id']).toBeTruthy();

    expect(call?.init.body).toBeDefined();
    const body = JSON.parse(call?.init.body ?? '{}');
    expect(body.operator).toBe('ORANGE');
  });

  it('overrides the country per call', async () => {
    const http = new FakeFetch([jsonResponse(200, { status: 'success', data: {} })]);
    const client = new BarkaPay({
      apiKey: 'k:s',
      country: 'bf',
      maxRetries: 0,
      fetch: http.fn,
    });

    await client.ping('sn');

    expect(http.lastCall?.url).toBe('https://hub.barkapay.com/sn/v1/ping');
  });

  it('forgives an accidental "Bearer " prefix', async () => {
    const http = new FakeFetch([jsonResponse(200, { status: 'success', data: {} })]);
    const client = new BarkaPay({
      apiKey: 'Bearer k:s',
      country: 'bf',
      maxRetries: 0,
      fetch: http.fn,
    });

    await client.ping();

    expect(http.lastCall?.init.headers.Authorization).toBe('Bearer k:s');
  });

  it('accepts keyId + secret passed separately', async () => {
    const http = new FakeFetch([jsonResponse(200, { status: 'success', data: {} })]);
    const client = new BarkaPay({
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
    const client = new BarkaPay({
      apiKey: 'k:s',
      country: 'bf',
      maxRetries: 0,
      fetch: http.fn,
    });

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
    const client = new BarkaPay({
      apiKey: 'k:s',
      country: 'bf',
      maxRetries: 0,
      fetch: http.fn,
    });

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
    const client = new BarkaPay({
      apiKey: 'k:s',
      country: 'bf',
      maxRetries: 0,
      fetch: http.fn,
    });

    const confirmed = await client.payments.confirmOtp('pay_1', '123456');
    expect(confirmed.status).toBe('SUCCESSFUL');
    expect(http.calls[0]?.url).toBe(
      'https://hub.barkapay.com/bf/v1/payments/pay_1/confirm-otp',
    );
    expect(JSON.parse(http.calls[0]?.init.body ?? '{}').otp).toBe('123456');

    await expect(client.payments.resendOtp('pay_1')).resolves.toBeUndefined();
    expect(http.calls[1]?.url).toBe(
      'https://hub.barkapay.com/bf/v1/payments/pay_1/resend-otp',
    );
  });

  it('creates and hydrates a transfer', async () => {
    const http = new FakeFetch([
      jsonResponse(201, {
        status: 'success',
        data: {
          transfer: { public_id: 'xfer_1', status: 'PROCESSING_OPERATOR', amount: 50000 },
        },
      }),
    ]);
    const client = new BarkaPay({
      apiKey: 'k:s',
      country: 'bf',
      maxRetries: 0,
      fetch: http.fn,
    });

    const transfer = await client.transfers.create({
      operator: 'ORANGE',
      phone_number: '74123456',
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
    const client = new BarkaPay({
      apiKey: 'k:s',
      country: 'bf',
      maxRetries: 0,
      fetch: http.fn,
    });

    const balance = await client.balance.get();

    expect(balance.available).toBe('1500.00');
    expect(balance.currency).toBe('XOF');
    expect(http.lastCall?.url).toBe('https://hub.barkapay.com/bf/v1/balance');
  });

  it('keeps the OTP a string end to end (a leading zero is significant)', async () => {
    const http = new FakeFetch([
      jsonResponse(200, {
        status: 'success',
        data: { payment: { public_id: 'pay_1', status: 'SUCCESSFUL' } },
      }),
      jsonResponse(200, {
        status: 'success',
        data: { payment: { public_id: 'pay_2', status: 'SUCCESSFUL' } },
      }),
    ]);
    const client = new BarkaPay({
      apiKey: 'k:s',
      country: 'bf',
      maxRetries: 0,
      fetch: http.fn,
    });

    await client.payments.create({
      operator: 'ORANGE',
      phone_number: '74123456',
      amount: 100,
      otp: '012345',
      order: { id: 'O-1' },
    });
    expect(http.calls[0]?.init.body).toContain('"otp":"012345"');

    await client.payments.confirmOtp('pay_2', '000042');
    expect(http.calls[1]?.init.body).toBe('{"otp":"000042"}');
  });

  it('returns the first match when several payments share an order id', async () => {
    const http = new FakeFetch([
      jsonResponse(200, {
        status: 'success',
        data: {
          payments: [
            { public_id: 'first', order_id: 'O-1', status: 'FAILED' },
            { public_id: 'second', order_id: 'O-1', status: 'SUCCESSFUL' },
          ],
        },
        meta: { count: 2, lookup_field: 'order_id' },
      }),
    ]);
    const client = new BarkaPay({
      apiKey: 'k:s',
      country: 'bf',
      maxRetries: 0,
      fetch: http.fn,
    });

    const payment = await client.payments.get('O-1');
    expect(payment.publicId).toBe('first');
  });

  it('throws NotFoundError when a lookup succeeds with no row', async () => {
    const http = new FakeFetch([
      jsonResponse(200, { status: 'success', data: { transfers: [] } }),
    ]);
    const client = new BarkaPay({
      apiKey: 'k:s',
      country: 'bf',
      maxRetries: 0,
      fetch: http.fn,
    });

    await expect(client.transfers.get('X-1')).rejects.toMatchObject({
      name: 'NotFoundError',
      httpStatus: 404,
    });
  });

  it('fails loudly when a creation succeeds without the created resource', async () => {
    const http = new FakeFetch([jsonResponse(201, { status: 'success', data: {} })]);
    const client = new BarkaPay({
      apiKey: 'k:s',
      country: 'bf',
      maxRetries: 0,
      fetch: http.fn,
    });

    await expect(
      client.transfers.create({
        operator: 'ORANGE',
        phone_number: '74123456',
        amount: 100,
        order: { id: 'X-1' },
      }),
    ).rejects.toThrow('`data.transfer` is missing');
  });

  it('returns ping / me / operators data as sent by the API', async () => {
    const http = new FakeFetch([
      jsonResponse(200, { status: 'success', data: { version: '2.0.0' } }),
      jsonResponse(200, {
        status: 'success',
        data: {
          merchant: { public_id: 'M-1', name: 'Shop', country: 'BF' },
          api_app: { label: 'app', scopes: ['payments:create'] },
        },
      }),
      jsonResponse(200, {
        status: 'success',
        data: {
          operators: { BFA: { ORANGE: { otp_required: true, min_amount: 100 } } },
          supported_countries: ['BFA'],
        },
      }),
      jsonResponse(200, {
        status: 'success',
        data: {
          operational: true,
          services: {
            BFA: { ORANGE: { payment: { status: 'operational', updated_at: null } } },
          },
        },
      }),
    ]);
    const client = new BarkaPay({
      apiKey: 'k:s',
      country: 'bf',
      maxRetries: 0,
      fetch: http.fn,
    });

    expect((await client.ping()).version).toBe('2.0.0');
    expect((await client.me()).api_app?.scopes).toEqual(['payments:create']);
    const info = await client.operators.info();
    expect(info.operators?.BFA?.ORANGE?.otp_required).toBe(true);
    expect(http.lastCall?.url).toBe('https://hub.barkapay.com/bf/v1/operators/info');
    const availability = await client.operators.availability();
    expect(availability.services?.BFA?.ORANGE?.payment?.status).toBe('operational');
    expect(http.lastCall?.url).toBe(
      'https://hub.barkapay.com/bf/v1/operators/availability',
    );
  });

  it('retries on 503 then succeeds', async () => {
    const http = new FakeFetch([
      jsonResponse(503, {
        status: 'error',
        code: 'service_unavailable',
        message: 'down',
      }),
      jsonResponse(200, { status: 'success', data: {} }),
    ]);
    const client = new BarkaPay({
      apiKey: 'k:s',
      country: 'bf',
      maxRetries: 1,
      fetch: http.fn,
    });

    await client.ping();

    expect(http.calls).toHaveLength(2);
  });
});
