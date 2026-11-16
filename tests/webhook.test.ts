import { createHmac } from 'node:crypto';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ConfigurationError,
  DEFAULT_TOLERANCE_SECONDS,
  SignatureVerificationError,
  WEBHOOK_SIGNATURE_HEADER,
  parseWebhook,
  verifyWebhookSignature,
} from '../src/index';

const SECRET = 'whsec_test_secret';
/** A delivery body exactly as the webhook dispatcher serialises it. */
const PAYLOAD =
  '{"public_id":"0198d4a2-1b2c-7d3e-8f40-5a6b7c8d9e0f","amount":10000,"phone_number":"74123456","country":"BF","status":"SUCCESSFUL","order_id":"ORDER-1","provider_transaction_id":"MP2611.1234","order_data":null,"reason":null,"app_label":"Boutique","reason_code":null,"provider_reason":null,"link_public_id":null,"type":"payment","fees":"150.00","event_id":"dlv:0198d4a2:payment.succeeded:whk_1","timestamp":"2026-11-16T10:00:00+00:00"}';

function hmac(
  payload: string | Buffer,
  timestamp: number | string,
  secret = SECRET,
): string {
  return createHmac('sha256', secret)
    .update(`${timestamp}.`)
    .update(payload)
    .digest('hex');
}

function sign(payload: string | Buffer, timestamp: number, secret = SECRET): string {
  return `t=${timestamp},v1=${hmac(payload, timestamp, secret)}`;
}

function now(): number {
  return Math.floor(Date.now() / 1000);
}

afterEach(() => {
  vi.useRealTimers();
});

describe('webhook signature — valid deliveries', () => {
  it('verifies and parses a valid signature', () => {
    const header = sign(PAYLOAD, now());

    expect(verifyWebhookSignature(PAYLOAD, header, SECRET)).toBe(true);

    const event = parseWebhook(PAYLOAD, header, SECRET);
    expect(event.type).toBe('payment');
    expect(event.status).toBe('SUCCESSFUL');
    expect(event.event_id).toBe('dlv:0198d4a2:payment.succeeded:whk_1');
    expect(event.fees).toBe('150.00');
    if (event.type === 'payment') {
      expect(event.link_public_id).toBeNull();
    }
  });

  it('accepts a delivery signed by the real sender implementation (reference vector)', () => {
    // Produced by the webhook dispatcher's own signing class
    // (`sign($body, 'whsec_test_secret', 1700000000)`), body serialised with
    // JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE as on the wire.
    const body =
      '{"public_id":"0198d4a2-1b2c-7d3e-8f40-5a6b7c8d9e0f","amount":10000,"status":"SUCCESSFUL","order_data":{"client":"Aïcha Ouédraogo","url":"https://shop.example/o/1"},"type":"payment","fees":"150.00","event_id":"dlv:0198d4a2:payment.succeeded:whk_1","timestamp":"2026-11-16T10:00:00+00:00"}';
    const header =
      't=1700000000,v1=3597cd7f8626fa04f40fddee4f533a1d17f6f888e933aaad4886471604bdcee6';
    vi.useFakeTimers({ now: 1_700_000_000_000 });

    expect(verifyWebhookSignature(body, header, SECRET)).toBe(true);
    expect(verifyWebhookSignature(Buffer.from(body, 'utf8'), header, SECRET)).toBe(true);
    expect(parseWebhook(body, header, SECRET).order_data).toEqual({
      client: 'Aïcha Ouédraogo',
      url: 'https://shop.example/o/1',
    });
  });

  it('accepts the raw body as a Buffer or a Uint8Array', () => {
    const bytes = Buffer.from(PAYLOAD, 'utf8');
    const header = sign(bytes, now());

    expect(verifyWebhookSignature(bytes, header, SECRET)).toBe(true);
    expect(verifyWebhookSignature(new Uint8Array(bytes), header, SECRET)).toBe(true);
    expect(parseWebhook(bytes, header, SECRET).public_id).toBe(
      '0198d4a2-1b2c-7d3e-8f40-5a6b7c8d9e0f',
    );
  });

  it('verifies non-ASCII bodies byte for byte', () => {
    const body =
      '{"type":"payment","order_data":{"client":"Aïcha Ouédraogo"},"status":"FAILED"}';
    const header = sign(Buffer.from(body, 'utf8'), now());

    expect(verifyWebhookSignature(body, header, SECRET)).toBe(true);
    expect(verifyWebhookSignature(Buffer.from(body, 'utf8'), header, SECRET)).toBe(true);
    // The same text in another encoding is a different body.
    expect(verifyWebhookSignature(Buffer.from(body, 'latin1'), header, SECRET)).toBe(
      false,
    );
  });

  it('accepts the header as Node hands it over (string[] or with spaces)', () => {
    const t = now();
    const signature = hmac(PAYLOAD, t);

    expect(verifyWebhookSignature(PAYLOAD, [`t=${t}`, `v1=${signature}`], SECRET)).toBe(
      true,
    );
    expect(verifyWebhookSignature(PAYLOAD, `t=${t}, v1=${signature}`, SECRET)).toBe(true);
    expect(verifyWebhookSignature(PAYLOAD, `v1=${signature},t=${t}`, SECRET)).toBe(true);
  });

  it('accepts an upper-case hex digest', () => {
    const t = now();
    expect(
      verifyWebhookSignature(
        PAYLOAD,
        `t=${t},v1=${hmac(PAYLOAD, t).toUpperCase()}`,
        SECRET,
      ),
    ).toBe(true);
  });

  it('accepts several v1 signatures when one of them matches (secret rotation)', () => {
    const t = now();
    const oldKey = hmac(PAYLOAD, t, 'whsec_previous');
    const newKey = hmac(PAYLOAD, t, SECRET);

    expect(
      verifyWebhookSignature(PAYLOAD, `t=${t},v1=${oldKey},v1=${newKey}`, SECRET),
    ).toBe(true);
    expect(
      verifyWebhookSignature(PAYLOAD, `t=${t},v1=${newKey},v1=${oldKey}`, SECRET),
    ).toBe(true);
    expect(
      verifyWebhookSignature(PAYLOAD, `t=${t},v1=${oldKey},v1=${oldKey}`, SECRET),
    ).toBe(false);
  });

  it('ignores signature schemes it does not know', () => {
    const t = now();
    expect(
      verifyWebhookSignature(
        PAYLOAD,
        `t=${t},v0=legacy,v1=${hmac(PAYLOAD, t)},v2=future`,
        SECRET,
      ),
    ).toBe(true);
  });

  it('exposes the header name', () => {
    expect(WEBHOOK_SIGNATURE_HEADER).toBe('Barkapay-Signature');
    expect(DEFAULT_TOLERANCE_SECONDS).toBe(300);
  });
});

describe('webhook signature — forgeries and replays', () => {
  it('rejects a tampered payload', () => {
    const header = sign(PAYLOAD, now());

    expect(
      verifyWebhookSignature(PAYLOAD.replace('10000', '99999'), header, SECRET),
    ).toBe(false);
  });

  it('rejects a body that was parsed and re-serialised', () => {
    const pretty = JSON.stringify(JSON.parse(PAYLOAD), null, 2);
    expect(verifyWebhookSignature(pretty, sign(PAYLOAD, now()), SECRET)).toBe(false);
  });

  it('rejects a wrong secret', () => {
    expect(verifyWebhookSignature(PAYLOAD, sign(PAYLOAD, now()), 'whsec_other')).toBe(
      false,
    );
  });

  it('rejects a signature made for another timestamp', () => {
    const t = now();
    expect(
      verifyWebhookSignature(PAYLOAD, `t=${t},v1=${hmac(PAYLOAD, t - 1)}`, SECRET),
    ).toBe(false);
  });

  it('enforces the tolerance window in the past and in the future', () => {
    vi.useFakeTimers({ now: 1_800_000_000_000 });
    const t = 1_800_000_000;

    expect(verifyWebhookSignature(PAYLOAD, sign(PAYLOAD, t - 300), SECRET)).toBe(true);
    expect(verifyWebhookSignature(PAYLOAD, sign(PAYLOAD, t - 301), SECRET)).toBe(false);
    expect(verifyWebhookSignature(PAYLOAD, sign(PAYLOAD, t + 300), SECRET)).toBe(true);
    expect(verifyWebhookSignature(PAYLOAD, sign(PAYLOAD, t + 301), SECRET)).toBe(false);
  });

  it('applies a custom tolerance; 0 switches the window off', () => {
    const stale = sign(PAYLOAD, now() - 1000);

    expect(verifyWebhookSignature(PAYLOAD, stale, SECRET)).toBe(false);
    expect(verifyWebhookSignature(PAYLOAD, stale, SECRET, 2000)).toBe(true);
    expect(verifyWebhookSignature(PAYLOAD, stale, SECRET, 0)).toBe(true);
    expect(verifyWebhookSignature(PAYLOAD, sign(PAYLOAD, now() - 20), SECRET, 10)).toBe(
      false,
    );
  });
});

describe('webhook signature — malformed headers', () => {
  const t = now();
  const good = hmac(PAYLOAD, t);

  it.each([
    ['missing', undefined],
    ['null', null],
    ['empty', ''],
    ['empty array', []],
    ['no key/value pairs', 'not-a-signature'],
    ['only a timestamp', `t=${t}`],
    ['only a signature', `v1=${good}`],
    ['non-numeric timestamp', `t=abc,v1=${good}`],
    ['negative timestamp', `t=-${t},v1=${good}`],
    ['decimal timestamp', `t=${t}.5,v1=${good}`],
    ['hex timestamp', `t=0x${t.toString(16)},v1=${good}`],
    ['zero timestamp', `t=0,v1=${good}`],
    ['overlong timestamp', `t=${'9'.repeat(13)},v1=${good}`],
    ['empty timestamp', `t=,v1=${good}`],
    ['duplicate timestamp', `t=${t},t=${t},v1=${good}`],
    ['conflicting timestamps', `t=${t},t=${t + 1},v1=${good}`],
    ['empty signature', `t=${t},v1=`],
    ['truncated signature', `t=${t},v1=${good.slice(0, 62)}`],
    ['overlong signature', `t=${t},v1=${good}00`],
    ['non-hex signature', `t=${t},v1=${'z'.repeat(64)}`],
    ['base64 signature', `t=${t},v1=${Buffer.from(good, 'hex').toString('base64')}`],
    ['a good signature next to a malformed one', `t=${t},v1=${good},v1=abc`],
    ['a dangling comma', `t=${t},v1=${good},`],
    ['an element without "="', `t=${t},v1=${good},garbage`],
    ['an element without a key', `t=${t},=${good},v1=${good}`],
    ['a key with a space', `t=${t},v 1=${good},v1=${good}`],
    ['wrong separator', `t=${t};v1=${good}`],
    ['wrong case for the keys', `T=${t},V1=${good}`],
    ['too many signatures', `t=${t}${`,v1=${good}`.repeat(17)}`],
    ['an oversized header', `t=${t},v1=${good},x=${'a'.repeat(5000)}`],
  ])('rejects a header with %s', (_label, header) => {
    expect(verifyWebhookSignature(PAYLOAD, header as never, SECRET)).toBe(false);
    expect(() => parseWebhook(PAYLOAD, header as never, SECRET)).toThrow(
      SignatureVerificationError,
    );
  });

  it('the control: the same data, well formed, is accepted', () => {
    expect(verifyWebhookSignature(PAYLOAD, `t=${t},v1=${good}`, SECRET)).toBe(true);
  });
});

describe('webhook — misuse is reported loudly', () => {
  it('refuses a parsed body (the express.json() pitfall)', () => {
    const parsed = JSON.parse(PAYLOAD) as never;
    const header = sign(PAYLOAD, now());

    expect(() => verifyWebhookSignature(parsed, header, SECRET)).toThrow(
      ConfigurationError,
    );
    expect(() => parseWebhook(parsed, header, SECRET)).toThrow(/RAW request body/);
    expect(() => parseWebhook(undefined as never, header, SECRET)).toThrow(
      ConfigurationError,
    );
  });

  it('refuses an empty or missing secret instead of verifying with an empty key', () => {
    const forged = sign(PAYLOAD, now(), '');

    expect(() => verifyWebhookSignature(PAYLOAD, forged, '')).toThrow(ConfigurationError);
    expect(() => verifyWebhookSignature(PAYLOAD, forged, undefined as never)).toThrow(
      ConfigurationError,
    );
    expect(() => parseWebhook(PAYLOAD, forged, '')).toThrow(ConfigurationError);
  });

  it('refuses a NaN tolerance instead of silently disabling the replay window', () => {
    expect(() =>
      verifyWebhookSignature(PAYLOAD, sign(PAYLOAD, now()), SECRET, Number.NaN),
    ).toThrow(ConfigurationError);
  });
});

describe('parseWebhook', () => {
  it('throws on a bad signature', () => {
    expect(() => parseWebhook(PAYLOAD, sign(PAYLOAD, now()), 'whsec_other')).toThrow(
      SignatureVerificationError,
    );
  });

  it('throws on a body that is not JSON, even with a valid signature', () => {
    const badBody = 'not-json';
    expect(() => parseWebhook(badBody, sign(badBody, now()), SECRET)).toThrow(
      'not valid JSON',
    );
  });

  it.each([['[1,2,3]'], ['"text"'], ['42'], ['null']])(
    'throws on a JSON body that is not an object: %s',
    (body) => {
      expect(() => parseWebhook(body, sign(body, now()), SECRET)).toThrow(
        'not a JSON object',
      );
    },
  );

  it('types a transfer event and tolerates unknown fields', () => {
    const body =
      '{"type":"transfer","public_id":"tr-1","status":"FAILED","reason_code":"recipient_invalid","fees":"0.00","event_id":"dlv:tr-1:transfer.failed:whk_1","timestamp":"2026-11-16T10:00:00+00:00","some_future_field":{"a":1}}';
    const event = parseWebhook(body, sign(body, now()), SECRET);

    expect(event.type).toBe('transfer');
    expect(event.reason_code).toBe('recipient_invalid');
    expect(event.some_future_field).toEqual({ a: 1 });
  });
});
