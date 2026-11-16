import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { PayHub, VERSION } from '../src/index';
import { FakeFetch, ok } from './fakeFetch';

function readJson(relative: string): Record<string, unknown> {
  const path = fileURLToPath(new URL(relative, import.meta.url));
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
}

describe('version', () => {
  const pkg = readJson('../package.json');

  it('matches package.json (the User-Agent must not lie)', () => {
    expect(VERSION).toBe(pkg.version);
    expect(PayHub.VERSION).toBe(pkg.version);
  });

  it('matches package-lock.json', () => {
    const lock = readJson('../package-lock.json');
    const root = (lock.packages as Record<string, { version?: string; name?: string }>)[
      ''
    ];

    expect(lock.version).toBe(pkg.version);
    expect(root?.version).toBe(pkg.version);
    expect(lock.name).toBe(pkg.name);
  });

  it('is announced in the User-Agent together with the runtime', async () => {
    const http = new FakeFetch([ok({})]);
    const client = new PayHub({ apiKey: 'k_id:s_secret', country: 'bf', fetch: http.fn });

    await client.ping();
    expect(http.lastCall?.init.headers['User-Agent']).toBe(
      `barkapay-payhub-node/${String(pkg.version)} node/${process.versions.node}`,
    );
  });

  it('is documented in the changelog', () => {
    const changelog = readFileSync(
      fileURLToPath(new URL('../CHANGELOG.md', import.meta.url)),
      'utf8',
    );
    expect(changelog).toContain(`## [${String(pkg.version)}]`);
  });

  it('ships no runtime dependency', () => {
    expect(pkg.dependencies ?? {}).toEqual({});
    expect(pkg.peerDependencies ?? {}).toEqual({});
  });
});
