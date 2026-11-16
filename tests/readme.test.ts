import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * Every ```ts block of the README is compiled, in strict mode, against the
 * real sources. A snippet that does not type-check fails the suite: the
 * documentation cannot drift away from the code.
 */

const root = fileURLToPath(new URL('..', import.meta.url));
const readme = readFileSync(`${root}README.md`, 'utf8');

/** Names the README uses without declaring them (each snippet is a fragment). */
const AMBIENT = `
declare const orderId: string;
declare const publicId: string;
declare const linkId: string;
declare const otpFromPayer: string;
declare const payerPhone: string;
declare const recipientPhone: string;
`;

/** A minimal stand-in for Express, which is not a dependency of this package. */
const EXPRESS_STUB = `
declare module 'express' {
  import type { IncomingHttpHeaders } from 'node:http';
  interface Request { body: Buffer; headers: IncomingHttpHeaders }
  interface Response { sendStatus(code: number): void; status(code: number): Response; end(): void }
  type Handler = (req: Request, res: Response, next: () => void) => void;
  interface Application { post(path: string, ...handlers: Handler[]): void; use(handler: Handler): void }
  interface Express { (): Application; raw(options?: { type?: string }): Handler; json(): Handler }
  const express: Express;
  export default express;
}
`;

function snippets(): { code: string; line: number }[] {
  const found: { code: string; line: number }[] = [];
  const pattern = /^```ts\n([\s\S]*?)^```$/gm;
  for (let match = pattern.exec(readme); match !== null; match = pattern.exec(readme)) {
    const line = readme.slice(0, match.index).split('\n').length + 1;
    found.push({ code: match[1] ?? '', line });
  }
  return found;
}

function compile(files: Map<string, string>): string[] {
  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    lib: ['lib.es2022.d.ts'],
    types: ['node'],
    strict: true,
    noUncheckedIndexedAccess: true,
    noEmit: true,
    skipLibCheck: true,
    baseUrl: root,
    paths: { 'barkapay-payhub': ['./src/index.ts'] },
  };

  const host = ts.createCompilerHost(options);
  const readFile = host.readFile.bind(host);
  const fileExists = host.fileExists.bind(host);
  const getSourceFile = host.getSourceFile.bind(host);
  host.fileExists = (name) => files.has(name) || fileExists(name);
  host.readFile = (name) => files.get(name) ?? readFile(name);
  host.getSourceFile = (name, languageVersion, ...rest) => {
    const virtual = files.get(name);
    return virtual === undefined
      ? getSourceFile(name, languageVersion, ...rest)
      : ts.createSourceFile(name, virtual, languageVersion, true);
  };

  const program = ts.createProgram([...files.keys()], options, host);
  return ts
    .getPreEmitDiagnostics(program)
    .filter((d) => d.file === undefined || files.has(d.file.fileName))
    .map((d) => {
      const text = ts.flattenDiagnosticMessageText(d.messageText, '\n');
      if (d.file === undefined || d.start === undefined) {
        return text;
      }
      const { line } = d.file.getLineAndCharacterOfPosition(d.start);
      return `${d.file.fileName.replace(root, '')}:${line + 1} ${text}`;
    });
}

describe('README', () => {
  const blocks = snippets();

  it('has TypeScript examples to check', () => {
    expect(blocks.length).toBeGreaterThanOrEqual(12);
  });

  it('every ```ts example compiles against the sources', () => {
    const files = new Map<string, string>();
    files.set(`${root}tests/__readme__/express.d.ts`, EXPRESS_STUB);

    for (const { code, line } of blocks) {
      // Each block is its own module (top-level await allowed). Unless it
      // builds its own client, it gets the one the README calls `barkapay`.
      const client = /\bconst barkapay\b/.test(code)
        ? ''
        : "declare const barkapay: import('barkapay-payhub').PayHub;\n";
      files.set(
        `${root}tests/__readme__/line-${line}.ts`,
        `${code}\nexport {};\n${client}${AMBIENT}`,
      );
    }

    expect(compile(files)).toEqual([]);
  }, 60_000);

  it('the checker really rejects a wrong snippet (guard against a vacuous pass)', () => {
    const files = new Map<string, string>([
      [
        `${root}tests/__readme__/broken.ts`,
        "import { PayHub } from 'barkapay-payhub';\n" +
          "const client = new PayHub({ apiKey: 'k:s', country: 'bf' });\n" +
          'await client.payments.refund("p");\n' +
          'export {};\n',
      ],
    ]);

    const errors = compile(files);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("Property 'refund' does not exist");
  }, 60_000);

  it('uses the brand in lower case and never points at the legacy site', () => {
    const prose = readme.replace(/```[\s\S]*?```/g, '').replace(/`[^`]*`/g, '');

    expect(prose).not.toMatch(/\bBarkaPay\b|\bBarkapay\b|\bBARKAPAY\b/);
    expect(prose).not.toMatch(/payhub(?!\.africa)/i);
    expect(readme).not.toMatch(/https?:\/\/(www\.)?barkapay\.com/);
  });
});
