# Security policy

## Reporting a vulnerability

Please **do not** open a public issue for a security vulnerability.

- Preferred: GitHub's [private vulnerability reporting](https://github.com/BarkaPay/barkapay-nodejs/security/advisories/new).
- Or email **security@payhub.africa** with the details and the steps to reproduce.

We aim to acknowledge a report within 72 hours and to keep you informed until a
fix is released. Please give us a reasonable time to ship it before disclosing.

## Supported versions

Security fixes are released for the latest minor version.

| Version                 | Supported                                      |
| ----------------------- | ---------------------------------------------- |
| 2.0.x (`barkapay`)      | yes                                            |
| 1.x (`barkapay-payhub`) | no — upgrade to 2.0 (a rename, see the README) |

## What the SDK does for you

- **Credentials stay out of sight.** The API key is kept in private fields: it is
  absent from `console.log`, `util.inspect` and `JSON.stringify` output and from
  the errors the SDK throws. The SDK itself never logs.
- **No redirect is ever followed**, so the `Authorization` header cannot be sent
  to another URL.
- **No blind replay of a money movement.** A request that creates a payment, a
  transfer or a payment link is retried only when the API answered 429 (nothing
  was done). After a timeout or a 5xx the outcome is unknown and the decision is
  yours — see “Retries, timeouts and safe replays” in the README.
- **Inputs are validated before they reach a URL**: identifiers and country
  codes cannot alter the request path.
- **Every request has a deadline** (30 s by default).
- **Webhook signatures** are checked with HMAC-SHA256 in constant time, with a
  replay window (300 s by default) and a strict header parser.
- **No runtime dependency**: nothing is installed alongside the SDK.
- **From 1.1.0 on, releases are built by GitHub Actions** and published with
  npm provenance, so a published version can be traced back to the commit and
  workflow that produced it.

## What remains your responsibility

- Keep the API key (`key_id:secret`) and webhook secrets (`whsec_…`) out of
  source control and out of client-side code. Load them from the environment or
  a secret manager, and rotate them from the dashboard if they are exposed.
- Restrict each API application to the scopes, operators and IP addresses it
  needs.
- Verify **every** webhook against the **raw** request body before trusting it,
  and deduplicate on `event_id`.
- Use one `order.id` per operation with `order.unique: true`, so that a retry on
  your side can never create a second payment or transfer.
- Serve your webhook endpoint over HTTPS and keep your server clock in sync
  (the replay window depends on it).
