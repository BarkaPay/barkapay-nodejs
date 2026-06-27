import { PayHub, PayHubError } from '@barkapay/payhub';

const payhub = new PayHub({
  apiKey: process.env.PAYHUB_API_KEY ?? 'pk_live_xxx:sk_live_yyy',
  country: 'bf',
});

async function main(): Promise<void> {
  try {
    // The OTP field is only needed for synchronous-OTP operators (e.g. Orange);
    // most async operators (MTN, Wave) return PROCESSING_OPERATOR and complete
    // via webhook. Always branch on the returned status.
    const payment = await payhub.payments.create({
      operator: 'ORANGE',
      phone_number: '50123456789',
      amount: 10000,
      otp: '123456',
      order: { id: `ORDER-${Date.now()}` },
    });

    console.log(`Payment ${payment.publicId} — status ${payment.status ?? 'unknown'}`);
  } catch (error) {
    if (error instanceof PayHubError) {
      console.error(`PayHub error: ${error.message}`);
      return;
    }
    throw error;
  }
}

void main();
