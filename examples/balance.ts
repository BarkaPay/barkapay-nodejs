import { PayHub, PayHubError } from 'barkapay-payhub';

const payhub = new PayHub({
  apiKey: process.env.PAYHUB_API_KEY ?? 'pk_live_xxx:sk_live_yyy',
  country: 'bf',
});

async function main(): Promise<void> {
  try {
    const balance = await payhub.balance.get();

    if (balance.balances !== null) {
      // Crypto (cc): one entry per asset/network.
      for (const b of balance.balances) {
        console.log(`${b.asset ?? '?'}/${b.network ?? '?'}: ${b.available ?? '0'}`);
      }
    } else {
      console.log(`Available: ${balance.available ?? '0'} ${balance.currency ?? ''}`);
    }
  } catch (error) {
    if (error instanceof PayHubError) {
      console.error(`PayHub error: ${error.message}`);
      return;
    }
    throw error;
  }
}

void main();
