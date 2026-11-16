# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.0] - 2026-11-16

Backward compatible with 1.0.0: no export was removed or renamed and every 1.0.0
call site still compiles. Read **Changed** before upgrading — two defaults became
stricter on purpose.

### Security

- **A request that moves money is no longer replayed on a network failure or a
  5xx.** 1.0.0 retried every request — `payments.create` and `transfers.create`
  included — on network errors, 429 and 503. The API has no idempotency-key
  header, so a replay after a timeout could charge a payer or pay a recipient
  twice. Calls that create something are now retried on 429 only (the request
  was refused before any work); reads and idempotent payment-link changes keep
  the full retry policy.
- **Redirects are never followed** (`redirect: 'manual'`). 1.0.0 let the HTTP
  stack follow a 3xx, which carries the `Authorization` header along to a
  same-origin redirect target.
- **The API key can no longer leak through object dumps.** It used to sit in a
  plain property, so `console.log(client)`, `util.inspect` and `JSON.stringify`
  printed it. It now lives in private fields; dumps show `[redacted]`. Transport
  errors are scrubbed as well.
- **Path injection closed.** Identifiers and country codes are validated before
  being placed in a URL; `.`, `..`, empty values, control characters and `/` are
  refused (1.0.0 only percent-encoded, which leaves dot segments intact).
- **Webhook verification hardened**: an empty secret is refused instead of being
  used as an HMAC key, the header is parsed strictly (exactly one numeric `t`,
  well-formed 64-hex `v1` only, bounded size), digests are compared as bytes in
  constant time, and several `v1` values are accepted for secret rotation.
- API keys containing whitespace, control or non-ASCII characters are refused at
  construction (they could never be valid, and broke the HTTP layer loudly).
- A plain-`http` `baseUrl` outside of loopback now emits a Node warning
  (`BARKAPAY_INSECURE_BASE_URL`).

### Added

- **Payment links** — `client.paymentLinks`: `create`, `list`, `get`, `update`,
  `cancel`, `pause`, `resume`, `listPayments`, with the `PaymentLink` type.
- `payments.create({ channel: 'hosted', … })` creates a payment link and
  resolves to a `PaymentLink`; `channel: 'direct'` (the default) is unchanged.
  The result is a union discriminated by the new `object` field
  (`'payment'` / `'payment_link'`).
- New fields on `Payment` and `Transfer`: `reasonCode` (stable failure code),
  `providerReason`, `providerReference`, plus `linkPublicId` and `redirectUrl`
  on `Payment`. `ReasonCode` / `REASON_CODES` publish the catalogue.
- New statuses: `EXPIRED` (payments), `UNCERTAIN` (transfers).
  `isPaymentStatusFinal('EXPIRED')` is `true`.
- New errors: `PaymentFailedError` and `TransferFailedError` (HTTP 424),
  `InsufficientBalanceError` (HTTP 400). They extend `ApiError`.
- `ApiError.data`, `ApiError.payment` and `ApiError.transfer`: the refused
  payment or transfer the API returns with a failure. `ApiError.retryAfter`:
  the `Retry-After` header, in seconds.
- `NetworkError.timedOut`, and the original error as `cause`.
- Webhooks: `Barkapay-Signature` is the header to read (constant
  `WEBHOOK_SIGNATURE_HEADER`); the raw body may be a `Buffer` / `Uint8Array`;
  the header may be passed straight from `req.headers`; `parseWebhook` returns a
  typed `WebhookEvent`.
- Typed list filters (`PaymentListParams`, `TransferListParams`, …) including
  `page`, and typed results for `ping()`, `me()`, `operators.info()` and
  `operators.availability()`.
- Retries now use exponential backoff **with jitter** and honour `Retry-After`;
  502, 504 and 408 are retried for idempotent requests.
- The timeout now also covers reading the response body, and holds even with a
  transport that ignores the abort signal.

### Changed

- **Retry policy** (see Security). If you relied on `payments.create` or
  `transfers.create` being retried automatically after a 503 or a network
  error, handle it explicitly: look the operation up with
  `list({ order_id })`, then decide. Use `order.unique: true`.
- **Stricter input validation**: an invalid country code, a malformed `baseUrl`,
  a non-positive `timeoutMs` or an identifier such as `..` now throws a
  `ConfigurationError` instead of producing a request that could only fail.
- `verifyWebhookSignature` / `parseWebhook` throw a `ConfigurationError` when
  given a parsed object instead of the raw body, or an empty secret (1.0.0
  returned `false`, hiding the mistake).
- A 2xx response whose body is not a JSON object, or that lacks the expected
  resource, now throws an `ApiError` instead of yielding an empty object.
- `fees` is always a string, also when the API sends the number `0`.
- Boolean query parameters are sent as `1` / `0`.
- The `User-Agent` is now `barkapay-payhub-node/<version> node/<node version>`.
- Documentation, error messages and examples use the brand name “barkapay”.
  Package, class and export names are unchanged.

### Fixed

- `VERSION` (and therefore the `User-Agent`) reported `0.1.0` in the 1.0.0
  package.
- A failed or timed-out body read surfaced as a raw `DOMException` instead of a
  `NetworkError`.
- `README`: `transfers.list({ from_date })` alone was shown as a working filter;
  the API only applies a date range when both `from_date` and `to_date` are sent.
- The type-check step failed on a clean checkout (the examples imported the
  package under a name the compiler could not resolve before a build).

## [1.0.0] - 2026-06-28

### Added

- Initial Node.js / TypeScript SDK: `PayHub` client with `payments`, `transfers`,
  `balance`, `operators` resources plus `ping()` / `me()`.
- Typed DTOs (`Payment`, `Transfer`, `Balance`, `Pagination`) and status string unions.
- Webhook signature verification (`verifyWebhookSignature` / `parseWebhook`).
- Typed error hierarchy mapped from the API error envelope.
- Zero runtime dependencies: global `fetch` + `node:crypto`, automatic retries on
  429/503/network. Dual ESM + CJS + type-definition build.

[Unreleased]: https://github.com/BarkaPay/payhub-nodejs/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/BarkaPay/payhub-nodejs/compare/f8c3be6...v1.1.0
[1.0.0]: https://www.npmjs.com/package/barkapay-payhub/v/1.0.0
