# Contributing

Thanks for helping improve the barkapay Node.js SDK.

## Development setup

The SDK runs on Node 18+, but its development tools need **Node 20.19 or later**.

```bash
npm ci
```

## Checks (must pass before opening a PR)

```bash
npm run lint          # eslint
npm run typecheck     # tsc --noEmit (sources, tests, examples and README-style type tests)
npm run format:check  # prettier
npm test              # vitest — injected fetch, no network
npm run build         # tsup (ESM + CJS + types)
npm run test:smoke    # the built package against a loopback server, real fetch
```

`npm run check` runs them all. CI runs the full suite on Node 20, 22 and 24, then
installs the packed tarball and runs the smoke tests on Node 18, 20, 22 and 24 —
that is how Node 18 support is verified even though the dev tools no longer run on it.

CI and the release workflow also run `node scripts/audit.mjs`: the runtime dependencies
(none today) must have no known advisory at all, and the dev tooling none except those
listed, with their reason, at the top of that script.

## Scope & conventions

- The SDK mirrors the public API — keep the surface in sync with it, and with the
  PHP and Python SDKs (same resource and method names).
- **No runtime dependencies**: stick to the global `fetch` and `node:crypto`.
- **Never retry a request that moves money** unless the API proves it did nothing
  (HTTP 429). See `RetryMode` in `src/apiClient.ts`.
- Credentials must never appear in an error message, a log or an object dump —
  `tests/security.test.ts` guards this.
- Add or update tests with every behaviour change; never call the live API from
  tests (use the injectable `fetch` option with a fake).
- Every `ts` block of the README is compiled by `tests/readme.test.ts`: keep the
  examples real.
- Open an issue first for larger changes so we can align on the design.

## Releasing (maintainers)

1. Update `version` in `package.json`, `src/version.ts` and `package-lock.json`
   (`npm version <x.y.z> --no-git-tag-version` handles the first and the last),
   and move the changelog entries under a dated heading.
2. Merge to `main` with a green CI.
3. Tag the merge commit and push the tag:

   ```bash
   git tag -a v2.0.0 -m "v2.0.0" && git push origin v2.0.0
   ```

The `Release` workflow checks that the tag matches `package.json` and sits on
`main`, re-runs every check, then publishes to npm through
[trusted publishing](https://docs.npmjs.com/trusted-publishers) (OIDC — no token
stored), with provenance. See the header of `.github/workflows/release.yml` for
the one-time npm setup and the token fallback.
