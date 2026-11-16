// Collect money from a payer (mobile money).
//   BARKAPAY_API_KEY="key_id:secret" BARKAPAY_PAYER_PHONE="…" npx tsx examples/collect.ts
import {
  NetworkError,
  PayHub,
  PayHubError,
  PaymentFailedError,
  ValidationError,
} from 'barkapay-payhub';

const barkapay = new PayHub({
  apiKey: process.env.BARKAPAY_API_KEY,
  country: 'bf',
});

// National format, without the country code (8 digits in Burkina Faso).
const payerPhone = process.env.BARKAPAY_PAYER_PHONE ?? '';

async function main(): Promise<void> {
  if (payerPhone === '') {
    throw new Error(
      'Set BARKAPAY_PAYER_PHONE to the number of a payer who agreed to the test.',
    );
  }
  const orderId = `ORDER-${Date.now()}`;

  try {
    const payment = await barkapay.payments.create({
      operator: 'ORANGE',
      phone_number: payerPhone,
      amount: 10000,
      // Orange takes the payer's OTP up-front. Keep it a string: "012345" is not 12345.
      otp: '123456',
      // `unique: true` makes a second call with the same id fail with a 409
      // instead of charging the payer twice.
      order: { id: orderId, unique: true },
    });

    // The flow depends on the operator — always branch on the status.
    switch (payment.status) {
      case 'SUCCESSFUL':
        console.log(
          `Paid: ${payment.publicId} (fees ${payment.fees ?? '?'} ${payment.currency ?? ''})`,
        );
        break;
      case 'AWAITING_OTP':
        // The payer received a code by SMS: collect it, then
        //   await barkapay.payments.confirmOtp(payment.publicId, code);
        console.log(`Waiting for the payer's OTP: ${payment.publicId}`);
        break;
      default:
        // PROCESSING_OPERATOR…: the final outcome arrives by webhook.
        if (payment.redirectUrl !== null) {
          console.log(`Send the payer to ${payment.redirectUrl}`);
        }
        console.log(
          `Pending: ${payment.publicId} — status ${payment.status ?? 'unknown'}`,
        );
    }
  } catch (error) {
    if (error instanceof PaymentFailedError) {
      // The operator or the payer refused. Final for this attempt.
      console.error(
        `Refused (${error.payment?.reasonCode ?? 'unknown'}): ${error.message}`,
      );
    } else if (error instanceof ValidationError) {
      console.error('Invalid request:', error.errors);
    } else if (error instanceof NetworkError) {
      // Unknown outcome: the payment may exist. Look it up before retrying.
      const { data } = await barkapay.payments.list({ order_id: orderId });
      console.error(
        data[0]
          ? `It went through: ${data[0].status ?? '?'}`
          : 'Not created — safe to retry.',
      );
    } else if (error instanceof PayHubError) {
      console.error(`barkapay error: ${error.message}`);
    } else {
      throw error;
    }
  }
}

void main();
