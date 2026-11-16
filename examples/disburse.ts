// Send money to a recipient (payout / transfer).
//   BARKAPAY_API_KEY="key_id:secret" BARKAPAY_RECIPIENT_PHONE="…" npx tsx examples/disburse.ts
import {
  ConflictError,
  InsufficientBalanceError,
  NetworkError,
  PayHub,
  PayHubError,
  TransferFailedError,
} from 'barkapay-payhub';

const barkapay = new PayHub({
  apiKey: process.env.BARKAPAY_API_KEY,
  country: 'bf',
});

// National format, without the country code (8 digits in Burkina Faso).
// ⚠️ This sends REAL money: only ever use a number you control.
const recipientPhone = process.env.BARKAPAY_RECIPIENT_PHONE ?? '';

async function main(): Promise<void> {
  if (recipientPhone === '') {
    throw new Error(
      'Set BARKAPAY_RECIPIENT_PHONE to a number you control: this sends real money.',
    );
  }
  const orderId = `PAYOUT-${Date.now()}`;

  try {
    const transfer = await barkapay.transfers.create({
      operator: 'ORANGE',
      phone_number: recipientPhone,
      amount: 500,
      order: { id: orderId, unique: true },
    });

    if (transfer.status === 'UNCERTAIN') {
      // Accepted, but the operator has not confirmed yet. Do NOT send it again:
      // the verdict arrives by webhook (transfer.succeeded / transfer.failed).
      console.log(`Awaiting the operator's verdict: ${transfer.publicId}`);
      return;
    }

    console.log(`Transfer ${transfer.publicId} — status ${transfer.status ?? 'unknown'}`);
  } catch (error) {
    if (error instanceof InsufficientBalanceError) {
      console.error('Top up your balance first.');
    } else if (error instanceof ConflictError) {
      // This order id was already used (order.unique), or the same transfer
      // reached the API in the last 60 seconds.
      console.error(`Duplicate transfer: ${error.message}`);
    } else if (error instanceof TransferFailedError) {
      console.error(
        `Refused (${error.transfer?.reasonCode ?? 'unknown'}): ${error.message}`,
      );
    } else if (error instanceof NetworkError) {
      // Unknown outcome: the transfer may be on its way. Look it up before retrying.
      const { data } = await barkapay.transfers.list({ order_id: orderId });
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
