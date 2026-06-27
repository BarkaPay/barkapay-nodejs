# Contributing

Thanks for helping improve the PayHub Node.js SDK.

## Development setup

```bash
npm install
```

## Checks (must pass before opening a PR)

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # eslint
npm test            # vitest run
npm run build       # tsup (ESM + CJS + types)
```

CI runs all four on Node 18, 20 and 22.

## Scope & conventions

- The SDK mirrors the PayHub OpenAPI spec — keep the public surface in sync with
  the API. Prefer small, typed additions.
- **No runtime dependencies**: stick to the global `fetch` and `node:crypto`.
- Open an issue first for larger changes so we can align on the design.
- Add or update tests with every behaviour change; never call the live API from
  tests (use the injectable `fetch` option with a fake).
