// Minimal webhook receiver (no framework). Mount it at the URL registered on
// your API application.
//   BARKAPAY_WEBHOOK_SECRET="whsec_…" npx tsx examples/webhook.ts
import { createServer } from 'node:http';

import {
  SignatureVerificationError,
  parseWebhook,
  type WebhookEvent,
} from 'barkapay-payhub';

const SECRET = process.env.BARKAPAY_WEBHOOK_SECRET ?? '';
if (SECRET === '') {
  throw new Error('Set BARKAPAY_WEBHOOK_SECRET to the whsec_… secret of your webhook.');
}

// Deliveries are at-least-once: remember what you already handled.
const handled = new Set<string>();

const server = createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on('data', (chunk: Buffer) => chunks.push(chunk));
  req.on('end', () => {
    // The RAW bytes, exactly as received — never a re-serialised object.
    const rawBody = Buffer.concat(chunks);

    let event: WebhookEvent;
    try {
      // Node lower-cases header names.
      event = parseWebhook(rawBody, req.headers['barkapay-signature'], SECRET);
    } catch (error) {
      if (error instanceof SignatureVerificationError) {
        res.writeHead(400).end();
        return;
      }
      throw error;
    }

    if (!handled.has(event.event_id)) {
      handled.add(event.event_id);

      // There is no `event` field — derive it from `type` + `status`.
      if (event.type === 'payment' && event.status === 'SUCCESSFUL') {
        console.log(`Order ${event.order_id ?? '?'} is paid (${event.public_id})`);
      } else if (event.type === 'payment') {
        console.log(
          `Payment ${event.public_id} ended ${event.status}: ${event.reason_code ?? 'no reason'}`,
        );
      } else {
        console.log(`Transfer ${event.public_id} ended ${event.status}`);
      }
    }

    // Answer 2xx fast; do slow work after responding.
    res.writeHead(200).end('ok');
  });
});

server.listen(3000, () => console.log('Listening on :3000'));
