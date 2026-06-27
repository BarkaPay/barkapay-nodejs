import { describe, expect, it } from 'vitest';

import { hydrateBalance, hydratePayment } from '../src/dto';
import { isPaymentStatusFinal, isTransferStatusFinal } from '../src/index';

describe('DTO hydration', () => {
  it('hydrates a payment and keeps the raw payload', () => {
    const payment = hydratePayment({
      public_id: 'pay_9',
      amount: 10000,
      fees: '250.00',
      currency: 'XOF',
      status: 'AWAITING_OTP',
      order_id: 'O-1',
      future_field: 'kept',
    });

    expect(payment.publicId).toBe('pay_9');
    expect(payment.amount).toBe(10000);
    expect(payment.fees).toBe('250.00');
    expect(payment.status).toBe('AWAITING_OTP');
    expect(payment.orderId).toBe('O-1');
    expect(payment.reason).toBeNull();
    expect(payment.raw.future_field).toBe('kept');
  });

  it('maps an unknown status to null', () => {
    const payment = hydratePayment({ public_id: 'p', status: 'SOMETHING_NEW' });
    expect(payment.status).toBeNull();
  });

  it('handles fiat and crypto balance shapes', () => {
    const fiat = hydrateBalance({ country: 'BF', currency: 'XOF', available: '1500.00' });
    expect(fiat.available).toBe('1500.00');
    expect(fiat.balances).toBeNull();

    const crypto = hydrateBalance({
      country: 'CC',
      balances: [{ asset: 'USDT', network: 'TRC20', available: '12.50' }],
    });
    expect(crypto.balances).toHaveLength(1);
    expect(crypto.balances?.[0]?.asset).toBe('USDT');
  });

  it('reports status finality', () => {
    expect(isPaymentStatusFinal('SUCCESSFUL')).toBe(true);
    expect(isPaymentStatusFinal('PROCESSING_OPERATOR')).toBe(false);
    expect(isTransferStatusFinal('REFUNDED')).toBe(true);
    expect(isTransferStatusFinal('CREATED')).toBe(false);
  });
});
