import { describe, expectTypeOf, it } from 'vitest';

import {
  PayHub,
  parseWebhook,
  verifyWebhookSignature,
  type FetchFn,
  type ListFilters,
  type Payment,
  type PaymentCreateParams,
  type PaymentLink,
  type PaymentLinkList,
  type PaymentLinkPaymentList,
  type PaymentList,
  type PaymentStatus,
  type ReasonCode,
  type Transfer,
  type TransferList,
  type WebhookEvent,
} from '../src/index';

/**
 * Compile-time contract. These assertions are enforced by `npm run typecheck`
 * (tsc over the tests); the functions below are never executed.
 */

const minimalFake: FetchFn = () =>
  // 1.0.0-style fake without `headers`: must stay assignable.
  Promise.resolve({ status: 200, text: () => Promise.resolve('{}') });

const client = new PayHub({ apiKey: 'k:s', country: 'bf', fetch: minimalFake });

describe('public types', () => {
  it('payments.create is a direct payment and resolves to a Payment', () => {
    const direct = () =>
      client.payments.create({
        operator: 'ORANGE',
        phone_number: '74123456',
        amount: 100,
        order: { id: 'O-1' },
      });
    expectTypeOf(direct).returns.resolves.toEqualTypeOf<Payment>();
    expectTypeOf(client.payments.create)
      .parameter(0)
      .toEqualTypeOf<PaymentCreateParams>();
  });

  it('payment-link fields are not accepted by payments.create', () => {
    const linkFields = { title: 'Invoice', amount: { type: 'fixed' as const, value: 1 } };
    // @ts-expect-error — a hosted checkout is `paymentLinks.create`, not `payments.create`.
    void (() => client.payments.create(linkFields));
  });

  it('resources resolve to their typed results', () => {
    expectTypeOf(client.payments.get).returns.resolves.toEqualTypeOf<Payment>();
    expectTypeOf(client.payments.list).returns.resolves.toEqualTypeOf<PaymentList>();
    expectTypeOf(client.payments.confirmOtp).returns.resolves.toEqualTypeOf<Payment>();
    expectTypeOf(client.payments.resendOtp).returns.resolves.toEqualTypeOf<void>();
    expectTypeOf(client.transfers.create).returns.resolves.toEqualTypeOf<Transfer>();
    expectTypeOf(client.transfers.list).returns.resolves.toEqualTypeOf<TransferList>();
    expectTypeOf(
      client.paymentLinks.create,
    ).returns.resolves.toEqualTypeOf<PaymentLink>();
    expectTypeOf(
      client.paymentLinks.list,
    ).returns.resolves.toEqualTypeOf<PaymentLinkList>();
    expectTypeOf(client.paymentLinks.get).returns.resolves.toEqualTypeOf<PaymentLink>();
    expectTypeOf(
      client.paymentLinks.update,
    ).returns.resolves.toEqualTypeOf<PaymentLink>();
    expectTypeOf(
      client.paymentLinks.cancel,
    ).returns.resolves.toEqualTypeOf<PaymentLink>();
    expectTypeOf(client.paymentLinks.pause).returns.resolves.toEqualTypeOf<PaymentLink>();
    expectTypeOf(
      client.paymentLinks.resume,
    ).returns.resolves.toEqualTypeOf<PaymentLink>();
    expectTypeOf(
      client.paymentLinks.listPayments,
    ).returns.resolves.toEqualTypeOf<PaymentLinkPaymentList>();
  });

  it('statuses and reason codes are closed for known values, open for future ones', () => {
    expectTypeOf<'EXPIRED'>().toExtend<PaymentStatus>();
    expectTypeOf<Payment['status']>().toEqualTypeOf<PaymentStatus | null>();
    expectTypeOf<'payer_refused'>().toExtend<ReasonCode>();
    expectTypeOf<'a_code_from_the_future'>().toExtend<ReasonCode>();
  });

  it('no public result leaks `any`', () => {
    expectTypeOf<Payment['raw']>().toEqualTypeOf<Record<string, unknown>>();
    expectTypeOf<Payment>().not.toBeAny();
    expectTypeOf<PaymentLink['collect']>().toEqualTypeOf<Record<string, unknown>>();
    expectTypeOf(client.ping).returns.resolves.not.toBeAny();
    expectTypeOf(parseWebhook).returns.not.toBeAny();
  });

  it('webhook helpers accept what Node hands over', () => {
    const headers: Record<string, string | string[] | undefined> = {};
    const check = () =>
      verifyWebhookSignature(Buffer.from('{}'), headers['barkapay-signature'], 'whsec');
    expectTypeOf(check).returns.toEqualTypeOf<boolean>();
    expectTypeOf(parseWebhook).returns.toEqualTypeOf<WebhookEvent>();

    const read = (event: WebhookEvent) => {
      if (event.type === 'payment') {
        expectTypeOf(event.link_public_id).toEqualTypeOf<string | null | undefined>();
      }
      return event.event_id;
    };
    expectTypeOf(read).returns.toEqualTypeOf<string>();
  });
});

describe('source compatibility with 1.0.0 call sites', () => {
  it('still compiles the loose shapes 1.0.0 accepted', () => {
    const calls = async () => {
      // Generic filter bags.
      const filters: ListFilters = { status: 'SUCCESSFUL', per_page: 50, anything: true };
      await client.payments.list(filters);
      await client.transfers.list(filters);
      await client.payments.list();

      // `order` typed as a plain record, or built empty.
      const order: Record<string, unknown> = { id: 'O-1' };
      await client.payments.create({
        operator: 'X',
        phone_number: '1',
        amount: 1,
        order,
      });
      await client.transfers.create({
        operator: 'X',
        phone_number: '1',
        amount: '1.50',
        order: {},
      });

      // Extra, undocumented fields were allowed.
      await client.payments.create({
        operator: 'X',
        phone_number: '1',
        amount: 1,
        order,
        custom: 1,
      });

      // Results used as plain records.
      const ping: Record<string, unknown> = await client.ping();
      const me: Record<string, unknown> = await client.me('sn');
      const availability: Record<string, unknown> = await client.operators.availability();
      const info: Record<string, unknown> = await client.operators.info({
        country: 'bj',
      });

      // Webhooks: string payload + string header, result cast to a record.
      const event = parseWebhook('{}', 't=1,v1=x', 'whsec') as Record<string, unknown>;
      const valid: boolean = verifyWebhookSignature('{}', 't=1,v1=x', 'whsec', 300);

      // The global fetch is a valid transport.
      new PayHub({ keyId: 'k', secret: 's', fetch: globalThis.fetch });

      return [ping, me, availability, info, event, valid];
    };
    expectTypeOf(calls).toBeFunction();
  });
});
