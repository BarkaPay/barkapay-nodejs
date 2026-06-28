import { ConflictError, PayHub, PayHubError } from 'barkapay-payhub';

const payhub = new PayHub({
  apiKey: process.env.PAYHUB_API_KEY ?? 'pk_live_xxx:sk_live_yyy',
  country: 'bf',
});

async function main(): Promise<void> {
  try {
    const transfer = await payhub.transfers.create({
      operator: 'ORANGE',
      phone_number: '50123456789',
      amount: 50000,
      order: { id: `XFER-${Date.now()}` },
    });

    console.log(`Transfer ${transfer.publicId} — status ${transfer.status ?? 'unknown'}`);
  } catch (error) {
    if (error instanceof ConflictError) {
      // The 60s duplicate guard fired — a near-identical transfer is already in flight.
      console.error(`Duplicate transfer: ${error.message}`);
      return;
    }
    if (error instanceof PayHubError) {
      console.error(`PayHub error: ${error.message}`);
      return;
    }
    throw error;
  }
}

void main();
