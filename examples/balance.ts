// Read-only tour: key check, balance, operators, recent payments.
//   BARKAPAY_API_KEY="key_id:secret" npx tsx examples/balance.ts
import { BarkaPay, BarkaPayError } from 'barkapay';

const barkapay = new BarkaPay({
  apiKey: process.env.BARKAPAY_API_KEY,
  country: 'bf',
});

async function main(): Promise<void> {
  try {
    const me = await barkapay.me();
    console.log(
      `Authenticated as ${me.merchant?.name ?? '?'} — scopes: ${(me.api_app?.scopes ?? []).join(', ')}`,
    );

    const balance = await barkapay.balance.get();
    console.log(
      `Available: ${balance.available ?? '0'} ${balance.currency ?? ''} (holds: ${balance.holds ?? '0'})`,
    );

    const { operators = {} } = await barkapay.operators.info();
    for (const [country, list] of Object.entries(operators)) {
      for (const [name, info] of Object.entries(list)) {
        console.log(
          `${country} ${name}: ${info.min_amount ?? '?'}–${info.max_amount ?? '?'}, OTP ${info.otp_required ? 'required' : 'not required'}`,
        );
      }
    }

    const recent = await barkapay.payments.list({ per_page: 5 });
    for (const payment of recent.data) {
      console.log(
        `${payment.createdAt ?? ''} ${payment.publicId} ${payment.status ?? '?'} ${String(payment.amount)}`,
      );
    }
    console.log(`${recent.meta?.total ?? 0} payment(s) in total`);
  } catch (error) {
    if (error instanceof BarkaPayError) {
      console.error(`barkapay error: ${error.message}`);
      return;
    }
    throw error;
  }
}

void main();
