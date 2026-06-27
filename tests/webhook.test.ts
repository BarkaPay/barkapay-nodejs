import { createHmac } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  SignatureVerificationError,
  parseWebhook,
  verifyWebhookSignature,
} from '../src/index';

const SECRET = 'whsec_test_secret';
const PAYLOAD = '{"type":"payment","public_id":"pay_1","status":"SUCCESSFUL"}';

function sign(payload: string, timestamp: number, secret: string = SECRET): string {
  const sig = createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
  return `t=${timestamp},v1=${sig}`;
}

function now(): number {
  return Math.floor(Date.now() / 1000);
}

describe('webhook signature', () => {
  it('verifies and parses a valid signature', () => {
    const header = sign(PAYLOAD, now());

    expect(verifyWebhookSignature(PAYLOAD, header, SECRET)).toBe(true);

    const event = parseWebhook(PAYLOAD, header, SECRET) as Record<string, unknown>;
    expect(event.type).toBe('payment');
    expect(event.status).toBe('SUCCESSFUL');
  });

  it('rejects a tampered payload', () => {
    const header = sign(PAYLOAD, now());

    expect(
      verifyWebhookSignature('{"type":"payment","amount":"999"}', header, SECRET),
    ).toBe(false);
  });

  it('rejects a wrong secret', () => {
    const header = sign(PAYLOAD, now());

    expect(verifyWebhookSignature(PAYLOAD, header, 'whsec_other')).toBe(false);
  });

  it('rejects a stale timestamp', () => {
    const header = sign(PAYLOAD, now() - 1000);

    expect(verifyWebhookSignature(PAYLOAD, header, SECRET)).toBe(false);
  });

  it('rejects a malformed header', () => {
    expect(verifyWebhookSignature(PAYLOAD, 'not-a-signature', SECRET)).toBe(false);
  });

  it('parse throws on a bad signature', () => {
    expect(() => parseWebhook(PAYLOAD, sign(PAYLOAD, now()), 'whsec_other')).toThrow(
      SignatureVerificationError,
    );
  });

  it('parse throws on invalid JSON body even with a valid signature', () => {
    const badBody = 'not-json';
    expect(() => parseWebhook(badBody, sign(badBody, now()), SECRET)).toThrow(
      SignatureVerificationError,
    );
  });
});
