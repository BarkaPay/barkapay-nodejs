# Changelog

All notable changes to this project are documented here. This project follows
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Initial Node.js / TypeScript SDK: `PayHub` client with `payments`, `transfers`,
  `balance`, `operators` resources plus `ping()` / `me()`.
- Typed DTOs (`Payment`, `Transfer`, `Balance`, `Pagination`) and status string unions.
- Webhook signature verification (`verifyWebhookSignature` / `parseWebhook`).
- Typed error hierarchy mapped from the API error envelope.
- Zero runtime dependencies: global `fetch` + `node:crypto`, automatic retries on
  429/503/network. Dual ESM + CJS + type-definition build.
