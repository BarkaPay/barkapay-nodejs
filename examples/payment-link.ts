// Create a payment link, share it, then follow what was paid through it.
//   BARKAPAY_API_KEY="key_id:secret" npx tsx examples/payment-link.ts
import { PayHub, PayHubError } from 'barkapay-payhub';

const barkapay = new PayHub({
  apiKey: process.env.BARKAPAY_API_KEY,
  country: 'bf',
});

async function main(): Promise<void> {
  try {
    const link = await barkapay.paymentLinks.create({
      title: 'Invoice #1234',
      amount: { type: 'fixed', value: 25000 },
      usage: 'single', // closed by the first successful payment
      order: { id: 'INV-1234' },
      redirect: { success_url: 'https://shop.example/thanks' },
      expires_at: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    });
    console.log(`Share this URL with your customer: ${link.url ?? ''}`);

    // Only title, description, expires_at and redirect can change afterwards.
    await barkapay.paymentLinks.update(link.publicId, { description: 'Thank you!' });

    // Stop new payers for a while, then re-open.
    await barkapay.paymentLinks.pause(link.publicId);
    await barkapay.paymentLinks.resume(link.publicId);

    // What was paid through the link (in this country).
    const paid = await barkapay.paymentLinks.listPayments(link.publicId, {
      status: 'SUCCESSFUL',
    });
    console.log(
      `${paid.paymentLink?.stats.paymentsCount ?? 0} payment(s), ${paid.paymentLink?.stats.totalCollected ?? '0'} collected`,
    );

    // Done with it.
    const canceled = await barkapay.paymentLinks.cancel(link.publicId);
    console.log(`Link is now ${canceled.status ?? 'unknown'}`);
  } catch (error) {
    if (error instanceof PayHubError) {
      console.error(`barkapay error: ${error.message}`);
      return;
    }
    throw error;
  }
}

void main();
