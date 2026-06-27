# PayHub Node.js SDK

Official Node.js / TypeScript client for the [PayHub](https://payhub.africa/developers)
payments API — mobile money & crypto, one API across countries.

- **Zero runtime dependencies** — uses the global `fetch` (Node 18+) and `node:crypto`.
- Dual **ESM + CommonJS** build with bundled **type definitions**.
- Typed payments, transfers and balance objects.
- Built-in webhook signature verification.
- Automatic retries on transient errors (429 / 503 / network).

## Requirements

Node **18+** (for the global `fetch`).

## Install

```bash
npm install @barkapay/payhub
```

## Quick start

```ts
import { PayHub } from '@barkapay/payhub';

const payhub = new PayHub({
  apiKey: 'pk_live_xxx:sk_live_yyy', // the "key_id:secret" you copy from the dashboard
  country: 'bf',                     // default country, overridable per call
});

const payment = await payhub.payments.create({
  operator: 'ORANGE',
  phone_number: '50123456789',
  amount: 10000,
  otp: '123456',                     // only for synchronous-OTP operators (e.g. Orange)
  order: { id: 'ORDER-2026-001' },
});

console.log(payment.publicId, payment.status);
```

> **Authentication:** pass the raw `key_id:secret` (or `keyId` + `secret` separately).
> The SDK adds the `Bearer` prefix — never include the word `Bearer` yourself
> (an accidental `Bearer ` prefix is forgiven).

CommonJS works too:

```js
const { PayHub } = require('@barkapay/payhub');
```

## Payments

```ts
await payhub.payments.create({ operator, phone_number, amount, order });
await payhub.payments.get('pay_… or order_id');          // by public_id or your order_id
await payhub.payments.list({ status: 'SUCCESSFUL', per_page: 50 }); // { data, meta }
await payhub.payments.confirmOtp(publicId, '123456');    // for AWAITING_OTP payments
await payhub.payments.resendOtp(publicId);
```

The flow depends on the operator — always branch on the returned `status`:
synchronous (`SUCCESSFUL` / `FAILED`), `AWAITING_OTP` (confirm step), or
`PROCESSING_OPERATOR` (final outcome arrives by webhook).

Every call accepts a per-call country override: `payhub.payments.get(id, { country: 'sn' })`.

## Transfers

```ts
await payhub.transfers.create({
  operator: 'ORANGE',
  phone_number: '50123456789',
  amount: 50000,
  order: { id: 'XFER-2026-001' },
});
await payhub.transfers.get(id);
await payhub.transfers.list({ from_date: '2026-06-01' });
```

## Balance & operators

```ts
const balance = await payhub.balance.get();  // available / total / holds / currency
// Crypto (cc) wallets fill `balance.balances` (one entry per asset/network) instead.

await payhub.operators.info();               // authoritative operator list for the country
await payhub.operators.availability();
await payhub.ping();
await payhub.me();
```

## Webhooks

Verify the `PayHub-Signature` header against the **raw** request body:

```ts
import { parseWebhook, SignatureVerificationError } from '@barkapay/payhub';

try {
  const event = parseWebhook(rawBody, signatureHeader, endpointSecret /* whsec_… */);
  // No `event` field — derive it from event.type + event.status.
  // Deduplicate on event.public_id (retries deliver the same body).
} catch (err) {
  if (err instanceof SignatureVerificationError) {
    res.writeHead(400).end();
  }
}
```

`verifyWebhookSignature(payload, header, secret, toleranceSeconds = 300): boolean`
is also available if you only need a boolean. The signature is
`v1 = HMAC-SHA256("{t}.{rawBody}")` keyed with your `whsec_` secret, compared in
constant time with a 300-second timestamp tolerance.

## Errors

Every API error throws a typed error extending `ApiError`
(`code`, `httpStatus`, `requestId`, `errors`):

| Error | When |
|---|---|
| `AuthenticationError` | 401 — bad credentials |
| `AuthorizationError`  | 403/410/451 — not allowed |
| `ValidationError`     | 422 — bad request (`.errors`) |
| `NotFoundError`       | 404 |
| `ConflictError`       | 409 — duplicate |
| `RateLimitError`      | 429 |
| `ServiceUnavailableError` | 503 — retryable |
| `ServerError`         | other 5xx |
| `NetworkError`        | request never reached a response |

Catch everything from the SDK with `PayHubError`. Configuration mistakes throw
`ConfigurationError`; webhook failures throw `SignatureVerificationError`.

```ts
import { PayHubError, ValidationError } from '@barkapay/payhub';

try {
  await payhub.payments.create({ /* … */ });
} catch (err) {
  if (err instanceof ValidationError) {
    console.error(err.errors); // field → messages
  } else if (err instanceof PayHubError) {
    console.error(err.message);
  }
}
```

## Configuration

```ts
new PayHub({
  apiKey: 'key_id:secret',
  country: 'bf',
  baseUrl: 'https://hub.barkapay.com',
  maxRetries: 2,        // 429/503/network
  timeoutMs: 30000,     // per-request timeout
  fetch: customFetch,   // any fetch-compatible function (for tests/proxies)
});
```

## License

MIT.
