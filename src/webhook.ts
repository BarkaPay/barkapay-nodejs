import { createHmac, timingSafeEqual } from 'node:crypto';

import { SignatureVerificationError } from './errors';

export const DEFAULT_TOLERANCE_SECONDS = 300;

/**
 * Verify the `PayHub-Signature` header on an incoming webhook.
 *
 * The header is `t=<unix_ts>,v1=<hex>` where `v1 = HMAC-SHA256("{t}.{rawBody}")`
 * keyed with your endpoint secret (`whsec_…`). Always verify against the RAW
 * request body — not a re-encoded copy.
 *
 * @returns `true` when the signature is valid, `false` otherwise.
 */
export function verifyWebhookSignature(
  payload: string,
  signatureHeader: string,
  secret: string,
  toleranceSeconds: number = DEFAULT_TOLERANCE_SECONDS,
): boolean {
  try {
    assertSignature(payload, signatureHeader, secret, toleranceSeconds);
    return true;
  } catch (error) {
    if (error instanceof SignatureVerificationError) {
      return false;
    }
    throw error;
  }
}

/**
 * Verify and decode the webhook body in one step.
 *
 * @throws {SignatureVerificationError} when the signature is invalid or the body is not JSON.
 */
export function parseWebhook(
  payload: string,
  signatureHeader: string,
  secret: string,
  toleranceSeconds: number = DEFAULT_TOLERANCE_SECONDS,
): unknown {
  assertSignature(payload, signatureHeader, secret, toleranceSeconds);

  try {
    return JSON.parse(payload);
  } catch {
    throw new SignatureVerificationError('Webhook payload is not valid JSON.');
  }
}

function assertSignature(
  payload: string,
  header: string,
  secret: string,
  tolerance: number,
): void {
  const parsed = parseHeader(header);
  if (parsed === null) {
    throw new SignatureVerificationError('Malformed or missing PayHub-Signature header.');
  }

  const { timestamp, signature } = parsed;

  if (tolerance > 0 && Math.abs(Math.floor(Date.now() / 1000) - timestamp) > tolerance) {
    throw new SignatureVerificationError('Webhook timestamp is outside the tolerance window.');
  }

  const expected = createHmac('sha256', secret)
    .update(`${timestamp}.${payload}`)
    .digest('hex');

  const expectedBuf = Buffer.from(expected, 'utf8');
  const signatureBuf = Buffer.from(signature, 'utf8');

  if (
    expectedBuf.length !== signatureBuf.length ||
    !timingSafeEqual(expectedBuf, signatureBuf)
  ) {
    throw new SignatureVerificationError('Webhook signature mismatch.');
  }
}

function parseHeader(header: string): { timestamp: number; signature: string } | null {
  let timestamp: string | null = null;
  let signature: string | null = null;

  for (const part of header.split(',')) {
    const idx = part.indexOf('=');
    if (idx === -1) {
      continue;
    }
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1);
    if (key === 't') {
      timestamp = value;
    } else if (key === 'v1') {
      signature = value;
    }
  }

  if (timestamp === null || signature === null || !/^\d+$/.test(timestamp)) {
    return null;
  }

  return { timestamp: Number.parseInt(timestamp, 10), signature };
}
