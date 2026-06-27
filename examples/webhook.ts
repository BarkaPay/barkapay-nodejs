import { createServer } from 'node:http';

import { SignatureVerificationError, parseWebhook } from '@barkapay/payhub';

const SECRET = process.env.PAYHUB_WEBHOOK_SECRET ?? 'whsec_xxx';

// Minimal webhook receiver. Mount this at your registered endpoint URL.
const server = createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on('data', (chunk: Buffer) => chunks.push(chunk));
  req.on('end', () => {
    // Verify against the RAW body before trusting anything.
    const rawBody = Buffer.concat(chunks).toString('utf8');
    const signature = req.headers['payhub-signature'];

    let event: Record<string, unknown>;
    try {
      event = parseWebhook(
        rawBody,
        typeof signature === 'string' ? signature : '',
        SECRET,
      ) as Record<string, unknown>;
    } catch (error) {
      if (error instanceof SignatureVerificationError) {
        res.writeHead(400).end();
        return;
      }
      throw error;
    }

    // There is no `event` field — derive it from `type` + `status`.
    const { type, status, public_id: publicId } = event;

    // TODO: deduplicate on publicId (retries deliver the same body) and update your order.
    // e.g. (type === 'payment' && status === 'SUCCESSFUL') => mark paid.
    console.log(`webhook: ${String(type)} ${String(status)} ${String(publicId)}`);

    res.writeHead(200).end('ok');
  });
});

server.listen(3000, () => console.log('Listening on :3000'));
