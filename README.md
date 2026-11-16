# barkapay Node.js SDK

Official Node.js / TypeScript client for the [barkapay API](https://barkapay.com/developers) —
mobile money collections, payouts and payment links across West Africa, behind one API.

- **Zero runtime dependencies** — the global `fetch` (Node 18+) and `node:crypto`, nothing else.
- Dual **ESM + CommonJS** build with bundled **type definitions**.
- Typed payments, transfers, payment links, balance and errors.
- Webhook signature verification built in.
- Safe by default: timeouts, retries only where a retry cannot move money twice,
  redirects never followed, API key never printed.

## Requirements

Node **18 or later**.

## Install

```bash
npm install barkapay
```

## Quick start

```ts
import { BarkaPay } from 'barkapay';

const barkapay = new BarkaPay({
  apiKey: process.env.BARKAPAY_API_KEY, // "key_id:secret", copied from your dashboard
  country: 'bf', // default country, overridable per call
});

const payment = await barkapay.payments.create({
  operator: 'ORANGE',
  phone_number: '74000000', // national format, without the country code
  amount: 10000,
  otp: '123456', // only for operators that take the payer's OTP up-front
  order: { id: 'ORDER-2026-001', unique: true },
});

console.log(payment.publicId, payment.status);
```

CommonJS works too:

```js
const { BarkaPay } = require('barkapay');
```

> **Authentication** — pass the raw `key_id:secret` (or `keyId` and `secret` separately).
> The SDK adds the `Bearer` prefix itself. Keep the key on your server: never ship it
> in a browser or a mobile app.

### Countries, operators and phone numbers

Every call targets one country: `bf` (Burkina Faso), `bj` (Bénin) or `sn` (Sénégal).
Set a default on the client and override it per call when needed:

```ts
await barkapay.balance.get({ country: 'sn' });
await barkapay.ping('bj');
```

- **Operators** are upper-case codes (`ORANGE`, `MOOV`, `MTN`, `WAVE`); the list for a
  country, with amount bounds and OTP requirement, comes from `operators.info()`.
- **Phone numbers** are in national format, **without the country code**: 8 digits in
  Burkina Faso, 9 in Sénégal, 10 in Bénin. A number that does not belong to the
  operator is refused with a `ValidationError`.

## Payments

```ts
// Charge a payer.
const payment = await barkapay.payments.create({
  operator: 'MOOV',
  phone_number: payerPhone,
  amount: 5000,
  order: { id: 'ORDER-2026-002', unique: true, data: { cart: '42' } },
});

// Look it up later, by its publicId or by your order id.
await barkapay.payments.get(payment.publicId);
await barkapay.payments.get('ORDER-2026-002');
// (An order id shaped like a UUID or containing "/" cannot be used here:
//  filter the list instead — list({ order_id }).)

// List, newest first.
const page = await barkapay.payments.list({
  status: 'SUCCESSFUL',
  per_page: 50,
  page: 1,
});
console.log(page.data.length, page.meta?.total);
```

What happens next depends on the operator — **always branch on `status`**:

| `status`                          | Meaning                                                      | What to do                          |
| --------------------------------- | ------------------------------------------------------------ | ----------------------------------- |
| `SUCCESSFUL`                      | Paid.                                                        | Deliver.                            |
| `AWAITING_OTP`                    | The payer received a code by SMS.                            | Ask for it, then call `confirmOtp`. |
| `PROCESSING_OPERATOR`             | The payer is approving on their phone (or on `redirectUrl`). | Wait for the webhook.               |
| `FAILED` / `EXPIRED` / `CANCELED` | Final, not paid.                                             | See `reasonCode`.                   |

```ts
// OTP step, for operators that send the code after creation
// (today: MOOV in Burkina Faso — these two calls only exist on `bf`).
// The OTP is a string: a leading zero is significant.
const confirmed = await barkapay.payments.confirmOtp(publicId, otpFromPayer);
await barkapay.payments.resendOtp(publicId); // the payer did not get the SMS
```

`barkapay.operators.info()` tells you, per operator, whether an OTP is required
(`otp_required`), the amount bounds and the instructions to show the payer.

A payment the operator or the payer **refuses** rejects with `PaymentFailedError`;
the refused payment is on the error:

```ts
import { PaymentFailedError } from 'barkapay';

try {
  await barkapay.payments.create({
    operator: 'ORANGE',
    phone_number: payerPhone,
    amount: 10000,
    otp: '123456',
    order: { id: orderId, unique: true },
  });
} catch (error) {
  if (error instanceof PaymentFailedError) {
    console.log(error.payment?.publicId, error.payment?.reasonCode); // e.g. "payer_insufficient_funds"
  } else {
    throw error;
  }
}
```

List filters: `status`, `operator`, `phone_number`, `channel`, `order_id`, `page`,
`per_page` (max 200), `amount` **with** `amount_operator` (`<`, `=`, `>`, `<=`, `>=`),
and `from_date` **with** `to_date` (a date range needs both ends).

## Payment links

A payment link is a page on the barkapay-hosted checkout: your customer opens it,
picks an operator and pays. No checkout to build.

```ts
const link = await barkapay.paymentLinks.create({
  title: 'Invoice #1234',
  amount: { type: 'fixed', value: 25000 }, // or { type: 'open' } / { type: 'range', min, max }
  usage: 'single', // closed by the first successful payment; 'multi' = reusable
  order: { id: 'INV-1234' },
  redirect: { success_url: 'https://shop.example/thanks' },
});

console.log(link.url); // share it with your customer
```

```ts
await barkapay.paymentLinks.get(linkId); // by "PL-…" id or by slug
await barkapay.paymentLinks.list({ status: 'active', per_page: 25 });
await barkapay.paymentLinks.update(linkId, {
  title: 'Invoice #1234 (updated)',
  description: null,
});
await barkapay.paymentLinks.pause(linkId); // the checkout refuses new payers
await barkapay.paymentLinks.resume(linkId);
await barkapay.paymentLinks.cancel(linkId); // for good

// Payments made through the link (in the country you call).
const paid = await barkapay.paymentLinks.listPayments(linkId, { status: 'SUCCESSFUL' });
console.log(paid.data.length, paid.paymentLink?.stats.totalCollected);
```

Only `title`, `description`, `expires_at` and `redirect` can change after creation.
`pause` and `resume` return the link unchanged when it is not in the expected state:
check `status` on the result. Payments made through a link carry
`channel: 'hosted'` and `linkPublicId`.

`payments.create` is always a direct payment: the hosted checkout is created
with `paymentLinks.create` only.

## Transfers

```ts
const transfer = await barkapay.transfers.create({
  operator: 'ORANGE',
  phone_number: recipientPhone,
  amount: 50000,
  order: { id: 'PAYOUT-2026-001', unique: true },
});

await barkapay.transfers.get(transfer.publicId); // or by your order id
await barkapay.transfers.list({ from_date: '2026-11-01', to_date: '2026-11-30' });
```

- `status: 'UNCERTAIN'` means the transfer was accepted but the operator has not
  confirmed yet. **Do not send it again** — the verdict arrives by webhook.
- The same transfer (same order id, number, amount and operator) sent again within
  60 seconds is refused with `ConflictError` — even when the first attempt was
  itself refused. Wait a minute, or use a new order id for a new attempt.
- `list({ status })` accepts neither `UNCERTAIN` nor `UNRESOLVED`: filter those on
  your side.
- Errors: `InsufficientBalanceError` (top up first), `TransferFailedError`
  (the operator refused; `error.transfer` holds the details).

## Balance & operators

```ts
const balance = await barkapay.balance.get(); // available / total / holds, as decimal strings
console.log(balance.available, balance.currency);

const { operators } = await barkapay.operators.info(); // authoritative operator list
const { services } = await barkapay.operators.availability(); // operational / degraded / down

await barkapay.ping(); // liveness
const me = await barkapay.me(); // merchant + API application (scopes, permissions)
console.log(operators, services, me.api_app?.scopes);
```

## Webhooks

barkapay POSTs a JSON body to your endpoint when a payment or a transfer reaches a
final state, signed in the **`Barkapay-Signature`** header
(`t=<unix time>,v1=<HMAC-SHA256 of "{t}.{raw body}">`, keyed with your `whsec_…` secret).

```ts
import { createServer } from 'node:http';
import { parseWebhook, SignatureVerificationError } from 'barkapay';

createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on('data', (chunk: Buffer) => chunks.push(chunk));
  req.on('end', () => {
    try {
      const event = parseWebhook(
        Buffer.concat(chunks), // the RAW body
        req.headers['barkapay-signature'],
        process.env.BARKAPAY_WEBHOOK_SECRET ?? '',
      );

      if (event.type === 'payment' && event.status === 'SUCCESSFUL') {
        // mark the order `event.order_id` as paid — once per `event.event_id`
      }
      res.writeHead(200).end();
    } catch (error) {
      res.writeHead(error instanceof SignatureVerificationError ? 400 : 500).end();
    }
  });
}).listen(3000);
```

**The signature covers the raw bytes of the body.** A body that has been parsed and
serialised again is different text and will never verify. With Express, that means
`express.json()` must not run on the webhook route — use `express.raw()` there:

```ts
import express from 'express';
import { parseWebhook } from 'barkapay';

const app = express();

// BEFORE any app.use(express.json()): keep the body as a Buffer on this route.
app.post('/webhooks/barkapay', express.raw({ type: 'application/json' }), (req, res) => {
  const event = parseWebhook(
    req.body, // a Buffer, thanks to express.raw()
    req.headers['barkapay-signature'],
    process.env.BARKAPAY_WEBHOOK_SECRET ?? '',
  );
  console.log(event.type, event.status, event.public_id);
  res.sendStatus(200);
});
```

Passing a parsed object throws a `ConfigurationError` that says so, rather than
failing silently.

Good to know:

- There is no `event` field in the body. Derive the event from `type` + `status`:
  `payment` + `SUCCESSFUL` is `payment.succeeded`, `FAILED` is `payment.failed`,
  `EXPIRED` is `payment.expired`; same for `transfer`.
- Deliveries are **at-least-once**: deduplicate on `event_id`, which is stable
  across re-deliveries.
- Answer with any `2xx` quickly; anything else is retried with a growing delay.
- A timestamp more than 300 seconds away from your clock is rejected (replay
  protection). Change it with the 4th argument — a positive number of seconds:
  `0`, a negative or a non-finite value throws a `ConfigurationError`, as does an
  empty secret.
- `verifyWebhookSignature(rawBody, header, secret)` returns a boolean if you prefer
  to parse the body yourself.

## Errors

Every failure throws an error that extends `BarkaPayError`. API errors extend
`ApiError` and carry `code`, `httpStatus`, `requestId` (quote it to support),
`errors` (field → messages), `data`, `retryAfter` and `headers` (`retry-after`,
`x-ratelimit-limit`, `x-ratelimit-remaining`, `x-request-id`). A `NetworkError`
carries the `requestId` the SDK sent.

A `2xx` whose body is not the expected JSON envelope (an HTML page, an empty body,
a JSON object without the resource) throws an `ApiError` with
`code: 'invalid_response'` — never an empty object passed off as a success. After a
create call it means "outcome unknown", not "refused": look the operation up.

| Error                        | HTTP            | When                                                                     |
| ---------------------------- | --------------- | ------------------------------------------------------------------------ |
| `ValidationError`            | 422 / 400       | Invalid request — see `error.errors`.                                    |
| `AuthenticationError`        | 401             | Missing or wrong API key.                                                |
| `AuthorizationError`         | 403 / 410 / 451 | Missing scope, IP not allowed, account suspended or closed.              |
| `NotFoundError`              | 404             | Unknown resource, endpoint or country.                                   |
| `ConflictError`              | 409             | Duplicate (`order.unique`, or the same transfer sent again within 60 s). |
| `InsufficientBalanceError`   | 400             | Your balance does not cover the transfer and its fees.                   |
| `PaymentFailedError`         | 424             | The payer or the operator refused — `error.payment`.                     |
| `TransferFailedError`        | 424             | The operator refused — `error.transfer`.                                 |
| `RateLimitError`             | 429             | Too many requests — wait `error.retryAfter` seconds.                     |
| `ServiceUnavailableError`    | 503             | barkapay or the operator is temporarily unavailable.                     |
| `ServerError`                | other 5xx       | Something broke on our side.                                             |
| `NetworkError`               | —               | No response (connection failed, or timed out: `error.timedOut`).         |
| `ConfigurationError`         | —               | The SDK was called with invalid arguments.                               |
| `SignatureVerificationError` | —               | A webhook could not be verified.                                         |

```ts
import { BarkaPayError, RateLimitError, ValidationError } from 'barkapay';

try {
  await barkapay.transfers.create({
    operator: 'ORANGE',
    phone_number: recipientPhone,
    amount: 50000,
    order: { id: orderId, unique: true },
  });
} catch (error) {
  if (error instanceof ValidationError) {
    console.error(error.errors); // { phone_number: ["…"] }
  } else if (error instanceof RateLimitError) {
    console.error(`Retry in ${error.retryAfter ?? '?'} s`);
  } else if (error instanceof BarkaPayError) {
    console.error(error.name, error.message);
  } else {
    throw error;
  }
}
```

Failed payments and transfers explain themselves with a stable `reasonCode`
(`payer_insufficient_funds`, `payer_refused`, `invalid_otp`, `otp_expired`,
`recipient_invalid`, `operator_unavailable`, …; the full list is exported as
`REASON_CODES`). Branch on the code; `reason` is its human-readable phrase and
`providerReason` the operator's own wording, for your support team.

## Retries, timeouts and safe replays

- **Timeout** — each attempt is abandoned after `timeoutMs` (40 s by default: the
  hub itself answers 503 after 30 s, so you receive its verdict rather than an
  ambiguous local timeout).
- **Automatic retries** (`maxRetries`, 2 by default, exponential backoff with
  jitter, `Retry-After` honoured up to 10 s — a longer wait is handed back to you
  as a `RateLimitError` with `retryAfter`):
  - reads (`get`, `list`, `balance`, …) are retried on connection failures,
    timeouts and `429 / 502 / 503 / 504`;
  - writes (`payments.create`, `payments.confirmOtp`, `payments.resendOtp`,
    `transfers.create`, `paymentLinks.create` / `update` / `cancel` / `pause` /
    `resume`) are retried on `429` only — the one answer that guarantees nothing
    was done.
- **After a timeout or a 5xx on a create call, the outcome is unknown.** The API has
  no idempotency-key header, so the SDK never re-sends it for you. Do this instead:

```ts
import { ApiError, NetworkError } from 'barkapay';

const params = {
  operator: 'ORANGE',
  phone_number: recipientPhone,
  amount: 50000,
  order: { id: orderId, unique: true }, // 1. one order id per operation, declared unique
};

try {
  await barkapay.transfers.create(params);
} catch (error) {
  const outcomeUnknown =
    error instanceof NetworkError ||
    (error instanceof ApiError && error.httpStatus >= 500);
  if (!outcomeUnknown) throw error;

  // 2. Did it go through after all? (A failed attempt carries it: error.transfer.)
  const { data } = await barkapay.transfers.list({ order_id: orderId });
  if (data.length > 0) {
    console.log('Already created:', data[0]?.publicId, data[0]?.status);
  } else {
    // 3. It did not: send it again. `unique` guards the race. A ConflictError
    //    here means the first attempt reached the API less than 60 seconds ago
    //    (still in progress, or refused): wait a minute and check again.
    await barkapay.transfers.create(params);
  }
}
```

## Pagination

`list` calls return `{ data, meta }` where `meta` is
`{ currentPage, lastPage, perPage, total }` (`lastPage` is not returned for
payment links — compute it from `total` and `perPage`).

```ts
let page = 1;
let lastPage = 1;

do {
  const { data, meta } = await barkapay.payments.list({ page, per_page: 100 });
  for (const payment of data) {
    console.log(payment.publicId, payment.status);
  }
  lastPage = meta?.lastPage ?? page;
  page += 1;
} while (page <= lastPage);
```

## Configuration

```ts
import { BarkaPay } from 'barkapay';

const client = new BarkaPay({
  apiKey: process.env.BARKAPAY_API_KEY, // or keyId + secret
  country: 'bf',
  baseUrl: 'https://hub.barkapay.com', // default
  timeoutMs: 40000, // per attempt
  maxRetries: 2, // 0 disables automatic retries
  fetch: globalThis.fetch, // any fetch-compatible function (proxy, tests)
});
```

`baseUrl` must be `https://`. Plain `http://` is accepted for a loopback host only
(`localhost`, `127.0.0.1`, `[::1]`) — or, when you pass your own `fetch`, for a mock
server on another host. It is always refused for a barkapay host.

Rate limits apply per route family; every response of the API carries
`x-ratelimit-limit` and `x-ratelimit-remaining`, and a `429` carries `Retry-After`
(exposed as `error.retryAfter`, the others as `error.headers`).

## Security notes

- The API key is held in private fields: it does not appear in `console.log`,
  `util.inspect` or `JSON.stringify` output, nor in the errors the SDK throws.
- Redirects are never followed (a `3xx` is an error), so the key cannot be replayed
  against another URL; plain `http://` is refused outside of loopback (see
  Configuration).
- Identifiers and country codes are validated and encoded before they are placed
  in a URL: an empty identifier, `.`, `..`, or one containing `/`, `?`, `#` or a
  control character is refused before any request; a country code is two letters.
- A response body larger than 10 MiB is refused (`NetworkError`).
- Webhook signatures are compared in constant time; verify every delivery before
  trusting it.

Report a vulnerability privately — see [SECURITY.md](./SECURITY.md).

## Upgrading from 1.x

2.0 is the same SDK under its final name: the package and a few exports were
renamed, nothing else changed.

```bash
npm uninstall barkapay-payhub
npm install barkapay@^2
```

- import from `'barkapay'` instead of `'barkapay-payhub'`;
- `PayHub` → `BarkaPay`, `PayHubOptions` → `BarkaPayOptions`, `PayHubError` →
  `BarkaPayError`;
- `PayHubRequestInit` / `PayHubResponse` / `PayHubResponseHeaders` →
  `BarkaPayRequestInit` / `BarkaPayResponse` / `BarkaPayResponseHeaders`;
- the `User-Agent` sent to the API is now `barkapay-node/2.0.0 …`.

Still on 1.0? Also read the 1.1 notes in the [changelog](./CHANGELOG.md): writes
are no longer replayed after a network error, a timeout or a 5xx (they could be
executed twice), redirects are never followed and the default timeout is 40 s.

## License

MIT.
