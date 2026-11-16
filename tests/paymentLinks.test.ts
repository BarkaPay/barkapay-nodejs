import { describe, expect, it } from 'vitest';

import { ApiError, ConfigurationError, PayHub } from '../src/index';
import { FakeFetch, ok, type Reply } from './fakeFetch';

/** A link exactly as GET /{cc}/v1/payments/links/{id} returns it. */
const LINK = {
  public_id: 'PL-0198c2f1-9f6a-7c4e-b1d2-3a4b5c6d7e8f',
  slug: '9j32HfkT2mQx4',
  url: 'https://checkout.example/9j32HfkT2mQx4',
  status: 'active',
  source: 'api',
  usage: 'single',
  amount: { type: 'fixed', value: '25000', min: null, max: null, currency: 'XOF' },
  title: 'Facture #1234',
  description: null,
  order: { id: 'INV-1234' },
  redirect: { success_url: 'https://shop.example/ok', cancel_url: null },
  restrictions: { countries: ['BF'], operators: ['orange', 'moov'] },
  payer: {
    full_name: 'Moussa Diallo',
    email: 'moussa@example.com',
    phone: null,
    locale: 'fr',
  },
  collect: { email: 'required' },
  notify: { email_invoice: true },
  expires_at: '2026-12-31T23:59:59+00:00',
  stats: { payments_count: 0, total_collected: '0' },
  paid_by_payment_public_id: null,
  created_at: '2026-11-16T10:00:00+00:00',
};

const BASE = 'https://hub.barkapay.com/bf/v1/payments/links';

function client(replies: Reply[]) {
  const http = new FakeFetch(replies);
  const payhub = new PayHub({
    apiKey: 'k_id:s_secret',
    country: 'bf',
    maxRetries: 0,
    fetch: http.fn,
  });
  return { payhub, http };
}

describe('paymentLinks', () => {
  it('create → POST /payments/links, hydrated', async () => {
    const { payhub, http } = client([ok({ payment_link: LINK }, undefined, 201)]);

    const link = await payhub.paymentLinks.create({
      title: 'Facture #1234',
      amount: { type: 'fixed', value: 25000 },
      order: { id: 'INV-1234' },
      payer: { full_name: 'Moussa Diallo', email: 'moussa@example.com', locale: 'fr' },
      redirect: { success_url: 'https://shop.example/ok' },
      expires_at: new Date('2026-12-31T23:59:59Z'),
    });

    expect(http.lastCall?.init.method).toBe('POST');
    expect(http.lastCall?.url).toBe(BASE);
    expect(http.body()).toEqual({
      title: 'Facture #1234',
      amount: { type: 'fixed', value: 25000 },
      order: { id: 'INV-1234' },
      payer: { full_name: 'Moussa Diallo', email: 'moussa@example.com', locale: 'fr' },
      redirect: { success_url: 'https://shop.example/ok' },
      expires_at: '2026-12-31T23:59:59.000Z',
    });

    expect(link).toEqual({
      object: 'payment_link',
      publicId: 'PL-0198c2f1-9f6a-7c4e-b1d2-3a4b5c6d7e8f',
      slug: '9j32HfkT2mQx4',
      url: 'https://checkout.example/9j32HfkT2mQx4',
      status: 'active',
      source: 'api',
      usage: 'single',
      amount: { type: 'fixed', value: '25000', min: null, max: null, currency: 'XOF' },
      title: 'Facture #1234',
      description: null,
      order: { id: 'INV-1234' },
      redirect: { successUrl: 'https://shop.example/ok', cancelUrl: null },
      restrictions: { countries: ['BF'], operators: ['orange', 'moov'] },
      payer: {
        fullName: 'Moussa Diallo',
        email: 'moussa@example.com',
        phone: null,
        locale: 'fr',
      },
      collect: { email: 'required' },
      notifyEmailInvoice: true,
      expiresAt: '2026-12-31T23:59:59+00:00',
      stats: { paymentsCount: 0, totalCollected: '0' },
      paidByPaymentPublicId: null,
      createdAt: '2026-11-16T10:00:00+00:00',
      raw: LINK,
    });
  });

  it('list → GET /payments/links with filters and pagination (no last_page)', async () => {
    const { payhub, http } = client([
      ok(
        { payment_links: [LINK, { ...LINK, public_id: 'PL-2', status: 'paid' }] },
        {
          current_page: 2,
          per_page: 2,
          total: 14,
        },
      ),
    ]);

    const page = await payhub.paymentLinks.list({
      status: 'active,paid',
      page: 2,
      per_page: 2,
    });

    expect(http.lastCall?.init.method).toBe('GET');
    expect(http.lastCall?.url).toBe(`${BASE}?status=active%2Cpaid&page=2&per_page=2`);
    expect(page.data.map((l) => [l.publicId, l.status])).toEqual([
      ['PL-0198c2f1-9f6a-7c4e-b1d2-3a4b5c6d7e8f', 'active'],
      ['PL-2', 'paid'],
    ]);
    expect(page.meta).toEqual({ currentPage: 2, lastPage: null, perPage: 2, total: 14 });
  });

  it('list → works without arguments', async () => {
    const { payhub, http } = client([
      ok({ payment_links: [] }, { current_page: 1, per_page: 25, total: 0 }),
    ]);

    const page = await payhub.paymentLinks.list();
    expect(http.lastCall?.url).toBe(BASE);
    expect(page.data).toEqual([]);
  });

  it('get → GET /payments/links/{id} by PL- id or by slug', async () => {
    const { payhub, http } = client([
      ok({ payment_link: LINK }),
      ok({ payment_link: LINK }),
    ]);

    const byId = await payhub.paymentLinks.get(LINK.public_id);
    expect(http.lastCall?.url).toBe(`${BASE}/${LINK.public_id}`);
    expect(byId.slug).toBe('9j32HfkT2mQx4');

    await payhub.paymentLinks.get('9j32HfkT2mQx4', { country: 'sn' });
    expect(http.lastCall?.url).toBe(
      'https://hub.barkapay.com/sn/v1/payments/links/9j32HfkT2mQx4',
    );
  });

  it('update → PATCH /payments/links/{id}, nulls preserved to clear fields', async () => {
    const { payhub, http } = client([
      ok({ payment_link: { ...LINK, title: 'New title' } }),
    ]);

    const link = await payhub.paymentLinks.update(LINK.public_id, {
      title: 'New title',
      description: null,
      expires_at: null,
      redirect: null,
    });

    expect(http.lastCall?.init.method).toBe('PATCH');
    expect(http.lastCall?.url).toBe(`${BASE}/${LINK.public_id}`);
    expect(http.body()).toEqual({
      title: 'New title',
      description: null,
      expires_at: null,
      redirect: null,
    });
    expect(link.title).toBe('New title');
  });

  it('cancel → DELETE /payments/links/{id}', async () => {
    const { payhub, http } = client([
      ok({ payment_link: { ...LINK, status: 'canceled' } }),
    ]);

    const link = await payhub.paymentLinks.cancel(LINK.public_id);

    expect(http.lastCall?.init.method).toBe('DELETE');
    expect(http.lastCall?.url).toBe(`${BASE}/${LINK.public_id}`);
    expect(http.lastCall?.init.body).toBeUndefined();
    expect(link.status).toBe('canceled');
  });

  it('pause / resume → POST /payments/links/{id}/pause|resume', async () => {
    const { payhub, http } = client([
      ok({ payment_link: { ...LINK, status: 'paused' } }),
      ok({ payment_link: LINK }),
    ]);

    const paused = await payhub.paymentLinks.pause(LINK.public_id);
    expect(http.lastCall?.init.method).toBe('POST');
    expect(http.lastCall?.url).toBe(`${BASE}/${LINK.public_id}/pause`);
    expect(paused.status).toBe('paused');

    const resumed = await payhub.paymentLinks.resume(LINK.public_id);
    expect(http.lastCall?.url).toBe(`${BASE}/${LINK.public_id}/resume`);
    expect(resumed.status).toBe('active');
  });

  it('listPayments → GET /payments/links/{id}/payments with the link summary', async () => {
    const { payhub, http } = client([
      ok(
        {
          payment_link: {
            public_id: LINK.public_id,
            slug: LINK.slug,
            status: 'active',
            stats: { payments_count: 42, total_collected: '1050000' },
          },
          payments: [
            {
              public_id: '0198d4a2-1b2c-7d3e-8f40-5a6b7c8d9e0f',
              status: 'SUCCESSFUL',
              amount: 25000,
              fees: '250.00',
              channel: 'hosted',
              link_public_id: LINK.public_id,
            },
          ],
        },
        { current_page: 1, last_page: 2, per_page: 25, total: 42 },
      ),
    ]);

    const page = await payhub.paymentLinks.listPayments(LINK.public_id, {
      status: 'SUCCESSFUL',
      from_date: '2026-11-01',
      to_date: '2026-11-30',
    });

    expect(http.lastCall?.init.method).toBe('GET');
    expect(http.lastCall?.url).toBe(
      `${BASE}/${LINK.public_id}/payments?status=SUCCESSFUL&from_date=2026-11-01&to_date=2026-11-30`,
    );
    expect(page.data).toHaveLength(1);
    expect(page.data[0]).toMatchObject({
      object: 'payment',
      status: 'SUCCESSFUL',
      channel: 'hosted',
      linkPublicId: LINK.public_id,
    });
    expect(page.meta).toEqual({ currentPage: 1, lastPage: 2, perPage: 25, total: 42 });
    expect(page.paymentLink).toEqual({
      publicId: LINK.public_id,
      slug: LINK.slug,
      status: 'active',
      stats: { paymentsCount: 42, totalCollected: '1050000' },
    });
  });

  it('retries the idempotent mutations on a network failure, never the creation', async () => {
    const reset = new Error('socket hang up');

    for (const run of [
      (p: PayHub) => p.paymentLinks.update('PL-1', { title: 't' }),
      (p: PayHub) => p.paymentLinks.cancel('PL-1'),
      (p: PayHub) => p.paymentLinks.pause('PL-1'),
      (p: PayHub) => p.paymentLinks.resume('PL-1'),
    ]) {
      const http = new FakeFetch([reset, ok({ payment_link: LINK })]);
      const payhub = new PayHub({
        apiKey: 'k_id:s_secret',
        country: 'bf',
        maxRetries: 1,
        fetch: http.fn,
      });
      await run(payhub);
      expect(http.calls).toHaveLength(2);
    }

    const http = new FakeFetch([reset, ok({ payment_link: LINK })]);
    const payhub = new PayHub({
      apiKey: 'k_id:s_secret',
      country: 'bf',
      maxRetries: 1,
      fetch: http.fn,
    });
    await expect(
      payhub.paymentLinks.create({ title: 't', amount: { type: 'open' } }),
    ).rejects.toThrow('failed to complete');
    expect(http.calls).toHaveLength(1);
  });

  it('fails loudly when a success response carries no link', async () => {
    const { payhub } = client([ok({})]);

    const error = await payhub.paymentLinks.get('PL-1').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).message).toContain('data.payment_link');
  });

  it('keeps an unknown status readable through raw', async () => {
    const { payhub } = client([ok({ payment_link: { ...LINK, status: 'archived' } })]);

    const link = await payhub.paymentLinks.get('PL-1');
    expect(link.status).toBeNull();
    expect(link.raw.status).toBe('archived');
  });
});

describe('payments.create — channel', () => {
  const DIRECT = {
    operator: 'ORANGE',
    phone_number: '70123456',
    amount: 10000,
    otp: '012345',
    order: { id: 'ORDER-1', unique: true },
  };

  it('direct (default): POST /payments → a Payment', async () => {
    const { payhub, http } = client([
      ok({ payment: { public_id: 'p-1', status: 'SUCCESSFUL' } }),
    ]);

    const result = await payhub.payments.create(DIRECT);

    expect(http.lastCall?.url).toBe('https://hub.barkapay.com/bf/v1/payments');
    expect(http.body()).toEqual(DIRECT);
    expect(result.object).toBe('payment');
    expect(result.status).toBe('SUCCESSFUL');
  });

  it('direct (explicit): the SDK-only `channel` field is not put on the wire', async () => {
    const { payhub, http } = client([
      ok({ payment: { public_id: 'p-1', status: 'AWAITING_OTP' } }),
    ]);

    const result = await payhub.payments.create({ channel: 'direct', ...DIRECT });

    expect(http.lastCall?.url).toBe('https://hub.barkapay.com/bf/v1/payments');
    expect(http.body()).toEqual(DIRECT);
    expect(http.body()).not.toHaveProperty('channel');
    expect(result.object).toBe('payment');
  });

  it('hosted: POST /payments/links → a PaymentLink, never a direct charge', async () => {
    const { payhub, http } = client([ok({ payment_link: LINK }, undefined, 201)]);

    const result = await payhub.payments.create({
      channel: 'hosted',
      title: 'Facture #1234',
      amount: { type: 'fixed', value: 25000 },
    });

    expect(http.calls).toHaveLength(1);
    expect(http.lastCall?.url).toBe(BASE);
    expect(http.body()).toEqual({
      title: 'Facture #1234',
      amount: { type: 'fixed', value: 25000 },
    });
    expect(result.object).toBe('payment_link');
    expect(result.url).toBe('https://checkout.example/9j32HfkT2mQx4');
  });

  it('lets a caller narrow the union on `object`', async () => {
    const { payhub } = client([ok({ payment_link: LINK })]);
    const params = { channel: 'hosted', title: 'T', amount: { type: 'open' } } as
      | (Parameters<typeof payhub.paymentLinks.create>[0] & { channel: 'hosted' })
      | typeof DIRECT;

    const result = await payhub.payments.create(params);

    if (result.object === 'payment_link') {
      expect(result.slug).toBe('9j32HfkT2mQx4');
    } else {
      expect.unreachable(`expected a payment link, got a payment ${result.publicId}`);
    }
  });

  it('refuses an unknown channel without calling the API', async () => {
    const { payhub, http } = client([ok({ payment: { public_id: 'p-1' } })]);

    await expect(
      payhub.payments.create({ ...DIRECT, channel: 'ussd' as never }),
    ).rejects.toBeInstanceOf(ConfigurationError);
    expect(http.calls).toHaveLength(0);
  });
});
