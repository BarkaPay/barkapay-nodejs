import { createHmac, timingSafeEqual } from 'node:crypto';

import { ConfigurationError, SignatureVerificationError } from './errors';
import type { WebhookEvent } from './types';
import { isRecord } from './util';

/** Name of the HTTP header that carries the signature (header names are case-insensitive). */
export const WEBHOOK_SIGNATURE_HEADER = 'Barkapay-Signature';

export const DEFAULT_TOLERANCE_SECONDS = 300;

/** The raw request body: the exact bytes received, as a string or a `Buffer` / `Uint8Array`. */
export type WebhookPayload = string | Uint8Array;

/**
 * The signature header value. `string[]` and `undefined` are accepted so that
 * `req.headers['barkapay-signature']` can be passed as is.
 */
export type WebhookSignatureHeader = string | readonly string[] | null | undefined;

const MAX_HEADER_LENGTH = 4096;
const MAX_SIGNATURES = 16;
const HEX_SHA256 = /^[0-9a-f]{64}$/i;

/**
 * Verify the `Barkapay-Signature` header of an incoming webhook.
 *
 * The header is `t=<unix_ts>,v1=<hex>` where `v1 = HMAC-SHA256("{t}.{rawBody}")`
 * keyed with your endpoint secret (`whsec_…`).
 *
 * ⚠️ `payload` MUST be the raw request body, byte for byte. A body that was
 * parsed and re-serialised (`express.json()` then `JSON.stringify(req.body)`)
 * does not have the same bytes and will never verify — see the README.
 *
 * @returns `true` when the signature is valid, `false` otherwise.
 * @throws {ConfigurationError} when called with a parsed body or without a secret.
 */
export function verifyWebhookSignature(
  payload: WebhookPayload,
  signatureHeader: WebhookSignatureHeader,
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
 * @throws {SignatureVerificationError} when the signature is missing, malformed,
 *   stale or wrong, or when the body is not a JSON object.
 * @throws {ConfigurationError} when called with a parsed body or without a secret.
 */
export function parseWebhook(
  payload: WebhookPayload,
  signatureHeader: WebhookSignatureHeader,
  secret: string,
  toleranceSeconds: number = DEFAULT_TOLERANCE_SECONDS,
): WebhookEvent {
  const body = assertSignature(payload, signatureHeader, secret, toleranceSeconds);

  let decoded: unknown;
  try {
    decoded = JSON.parse(body.toString('utf8'));
  } catch {
    throw new SignatureVerificationError('Webhook payload is not valid JSON.');
  }
  if (!isRecord(decoded)) {
    throw new SignatureVerificationError('Webhook payload is not a JSON object.');
  }

  return decoded as WebhookEvent;
}

/** Throws unless the signature is valid; returns the raw body as bytes. */
function assertSignature(
  payload: WebhookPayload,
  header: WebhookSignatureHeader,
  secret: string,
  tolerance: number,
): Buffer {
  const body = toBytes(payload);

  if (typeof secret !== 'string' || secret === '') {
    throw new ConfigurationError(
      'A webhook secret (whsec_…) is required to verify signatures.',
    );
  }
  if (typeof tolerance !== 'number' || Number.isNaN(tolerance)) {
    throw new ConfigurationError('`toleranceSeconds` must be a number.');
  }

  const parsed = parseHeader(header);
  if (parsed === null) {
    throw new SignatureVerificationError(
      `Malformed or missing ${WEBHOOK_SIGNATURE_HEADER} header.`,
    );
  }

  const { timestamp, signatures } = parsed;

  // A tolerance of 0 (or less) switches the replay window off — not recommended.
  if (tolerance > 0 && Math.abs(Math.floor(Date.now() / 1000) - timestamp) > tolerance) {
    throw new SignatureVerificationError(
      'Webhook timestamp is outside the tolerance window.',
    );
  }

  // Sign exactly what was received: the timestamp digits as sent, then the body bytes.
  const expected = createHmac('sha256', secret)
    .update(`${parsed.rawTimestamp}.`, 'utf8')
    .update(body)
    .digest();

  // Compare every candidate — no early exit — in constant time. Each side is a
  // 32-byte digest (the header parser only lets 64-hex-digit values through).
  let matched = false;
  for (const signature of signatures) {
    const candidate = Buffer.from(signature, 'hex');
    if (candidate.length === expected.length && timingSafeEqual(candidate, expected)) {
      matched = true;
    }
  }

  if (!matched) {
    throw new SignatureVerificationError('Webhook signature mismatch.');
  }

  return body;
}

function toBytes(payload: unknown): Buffer {
  if (typeof payload === 'string') {
    return Buffer.from(payload, 'utf8');
  }
  if (payload instanceof Uint8Array) {
    return Buffer.from(payload.buffer, payload.byteOffset, payload.byteLength);
  }
  throw new ConfigurationError(
    'Webhook verification needs the RAW request body (a string or a Buffer), ' +
      'not a parsed object. With Express, mount `express.raw({ type: "application/json" })` ' +
      'on the webhook route instead of `express.json()`.',
  );
}

/**
 * Strict parser for `t=<digits>,v1=<64 hex>[,v1=<64 hex>…]`.
 *
 * - exactly one `t`, made of digits only;
 * - at least one `v1`, and every `v1` must be a well-formed SHA-256 hex digest
 *   (several are accepted so that a secret rotation can sign with both keys);
 * - unknown schemes (`v0=`, `v2=`…) are ignored for forward-compatibility;
 * - anything else — empty element, missing `=`, oversized header — is refused.
 */
function parseHeader(
  header: WebhookSignatureHeader,
): { timestamp: number; rawTimestamp: string; signatures: string[] } | null {
  const value = Array.isArray(header) ? header.join(',') : header;
  if (typeof value !== 'string' || value === '' || value.length > MAX_HEADER_LENGTH) {
    return null;
  }

  let timestamp: number | null = null;
  let rawTimestamp = '';
  const signatures: string[] = [];

  for (const element of value.split(',')) {
    const part = element.trim();
    const idx = part.indexOf('=');
    if (idx <= 0) {
      return null;
    }
    const key = part.slice(0, idx);
    const val = part.slice(idx + 1);

    if (key === 't') {
      if (timestamp !== null || !/^\d{1,12}$/.test(val)) {
        return null;
      }
      timestamp = Number.parseInt(val, 10);
      rawTimestamp = val;
    } else if (key === 'v1') {
      if (!HEX_SHA256.test(val) || signatures.length >= MAX_SIGNATURES) {
        return null;
      }
      signatures.push(val);
    } else if (!/^[a-z][a-z0-9]*$/i.test(key)) {
      return null;
    }
  }

  if (timestamp === null || timestamp <= 0 || signatures.length === 0) {
    return null;
  }

  return { timestamp, rawTimestamp, signatures };
}
