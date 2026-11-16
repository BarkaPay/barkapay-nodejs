import { describe, expect, it } from 'vitest';

import {
  hydrateBalance,
  hydratePayment,
  hydratePaymentLink,
  hydrateTransfer,
} from '../src/dto';
import {
  PAYMENT_LINK_STATUSES,
  PAYMENT_STATUSES,
  REASON_CODES,
  TRANSFER_STATUSES,
  isPaymentStatusFinal,
  isTransferStatusFinal,
} from '../src/index';

describe('DTO hydration', () => {
  it('hydrates a payment exactly as GET /payments returns it', () => {
    const raw = {
      public_id: '0198d4a2-1b2c-7d3e-8f40-5a6b7c8d9e0f',
      amount: 10000,
      fees: '250.00',
      currency: 'XOF',
      phone_number: '70123456',
      country: 'BF',
      operator: 'ORANGE',
      channel: 'hosted',
      status: 'FAILED',
      order_id: 'O-1',
      provider_transaction_id: null,
      provider_reference: 'OM-REF-9',
      order_data: { cart: '42' },
      link_public_id: 'PL-1',
      reason: 'Payer refused the transaction.',
      reason_code: 'payer_refused',
      provider_reason: 'Transaction annulée par le client',
      created_at: '2026-11-16T10:00:00.000000Z',
      future_field: 'kept',
    };

    expect(hydratePayment(raw)).toEqual({
      object: 'payment',
      publicId: '0198d4a2-1b2c-7d3e-8f40-5a6b7c8d9e0f',
      amount: 10000,
      fees: '250.00',
      currency: 'XOF',
      phoneNumber: '70123456',
      country: 'BF',
      operator: 'ORANGE',
      channel: 'hosted',
      status: 'FAILED',
      orderId: 'O-1',
      providerTransactionId: null,
      providerReference: 'OM-REF-9',
      orderData: { cart: '42' },
      linkPublicId: 'PL-1',
      reason: 'Payer refused the transaction.',
      reasonCode: 'payer_refused',
      providerReason: 'Transaction annulée par le client',
      redirectUrl: null,
      createdAt: '2026-11-16T10:00:00.000000Z',
      raw,
    });
  });

  it('keeps unknown fields reachable through raw', () => {
    const payment = hydratePayment({ public_id: 'p', future_field: 'kept' });
    expect(payment.raw.future_field).toBe('kept');
  });

  it('hands fees back as a string even when the API sends a number', () => {
    // Creation responses emit `fees: 0` (a JSON number) when no fee applies.
    expect(hydratePayment({ public_id: 'p', fees: 0 }).fees).toBe('0');
    expect(hydratePayment({ public_id: 'p', fees: 6.25 }).fees).toBe('6.25');
    expect(hydrateTransfer({ public_id: 't', fees: '6.25' }).fees).toBe('6.25');
    expect(hydratePayment({ public_id: 'p' }).fees).toBeNull();
  });

  it('exposes the redirect URL of redirect-based operators', () => {
    const payment = hydratePayment({
      public_id: 'p',
      status: 'PROCESSING_OPERATOR',
      redirect_url: 'https://pay.wave.com/c/cos-123',
    });
    expect(payment.redirectUrl).toBe('https://pay.wave.com/c/cos-123');
  });

  it('knows the statuses added since 1.0.0', () => {
    expect(hydratePayment({ public_id: 'p', status: 'EXPIRED' }).status).toBe('EXPIRED');
    expect(hydrateTransfer({ public_id: 't', status: 'UNCERTAIN' }).status).toBe(
      'UNCERTAIN',
    );
  });

  it('maps an unknown status to null and keeps it in raw', () => {
    const payment = hydratePayment({ public_id: 'p', status: 'SOMETHING_NEW' });
    expect(payment.status).toBeNull();
    expect(payment.raw.status).toBe('SOMETHING_NEW');
  });

  it('passes an unknown reason code through', () => {
    expect(
      hydratePayment({ public_id: 'p', reason_code: 'brand_new_code' }).reasonCode,
    ).toBe('brand_new_code');
  });

  it('hydrates a transfer with its operator reference and reason triple', () => {
    const transfer = hydrateTransfer({
      public_id: 't-1',
      amount: 5000,
      fees: '50.00',
      status: 'FAILED',
      provider_reference: 'PAYOUT-77',
      reason: 'Recipient account is invalid.',
      reason_code: 'recipient_invalid',
      provider_reason: null,
    });

    expect(transfer).toMatchObject({
      object: 'transfer',
      publicId: 't-1',
      providerReference: 'PAYOUT-77',
      reasonCode: 'recipient_invalid',
      providerReason: null,
    });
  });

  it('tolerates wrong types instead of throwing', () => {
    const payment = hydratePayment({
      public_id: 42,
      amount: { nested: true },
      status: 7,
      order_data: 'not-an-object',
      reason_code: ['x'],
    });
    expect(payment).toMatchObject({
      publicId: '',
      amount: null,
      status: null,
      orderData: null,
      reasonCode: null,
    });
  });

  it('hydrates a balance', () => {
    const balance = hydrateBalance({
      country: 'BF',
      currency: 'XOF',
      available: '1500.00',
      total: '2000.00',
      holds: '500.00',
    });
    expect(balance).toMatchObject({
      country: 'BF',
      currency: 'XOF',
      available: '1500.00',
      total: '2000.00',
      holds: '500.00',
      balances: null,
    });
  });

  it('keeps a per-asset balance breakdown when the API sends one', () => {
    const balance = hydrateBalance({
      balances: [{ asset: 'A', available: '12.50' }, 'junk'],
    });
    expect(balance.balances).toEqual([{ asset: 'A', available: '12.50' }]);
  });

  it('hydrates a sparse payment link without throwing', () => {
    const link = hydratePaymentLink({ public_id: 'PL-1', collect: {}, payer: null });
    expect(link).toMatchObject({
      object: 'payment_link',
      publicId: 'PL-1',
      status: null,
      amount: { type: null, value: null, min: null, max: null, currency: null },
      redirect: null,
      restrictions: null,
      payer: null,
      collect: {},
      notifyEmailInvoice: null,
      stats: { paymentsCount: null, totalCollected: null },
    });
  });
});

describe('status helpers', () => {
  it('reports payment finality', () => {
    expect(isPaymentStatusFinal('SUCCESSFUL')).toBe(true);
    expect(isPaymentStatusFinal('FAILED')).toBe(true);
    expect(isPaymentStatusFinal('EXPIRED')).toBe(true);
    expect(isPaymentStatusFinal('CANCELED')).toBe(true);
    expect(isPaymentStatusFinal('PROCESSING_OPERATOR')).toBe(false);
    expect(isPaymentStatusFinal('AWAITING_OTP')).toBe(false);
    expect(isPaymentStatusFinal(null)).toBe(false);
  });

  it('reports transfer finality — UNCERTAIN is not final', () => {
    expect(isTransferStatusFinal('SUCCESSFUL')).toBe(true);
    expect(isTransferStatusFinal('FAILED')).toBe(true);
    expect(isTransferStatusFinal('REFUNDED')).toBe(true);
    expect(isTransferStatusFinal('UNCERTAIN')).toBe(false);
    expect(isTransferStatusFinal('CREATED')).toBe(false);
    expect(isTransferStatusFinal(null)).toBe(false);
  });

  it('publishes the catalogues', () => {
    expect(PAYMENT_STATUSES).toContain('EXPIRED');
    expect(PAYMENT_STATUSES).toHaveLength(10);
    expect(TRANSFER_STATUSES).toContain('UNCERTAIN');
    expect(TRANSFER_STATUSES).toHaveLength(9);
    expect(PAYMENT_LINK_STATUSES).toEqual([
      'active',
      'paused',
      'paid',
      'expired',
      'canceled',
      'admin_blocked',
    ]);
    expect(REASON_CODES).toHaveLength(16);
    expect(new Set(REASON_CODES).size).toBe(16);
  });
});
