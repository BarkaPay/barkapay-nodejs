import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

const nodeGlobals = {
  Buffer: 'readonly',
  console: 'readonly',
  globalThis: 'readonly',
  process: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
};

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // The SDK itself: the API key must never reach a log.
    files: ['src/**/*.ts'],
    rules: {
      'no-console': 'error',
    },
  },
  {
    // Runtime smoke tests: plain Node scripts, CommonJS or ESM, no TypeScript.
    files: ['smoke/**/*.cjs', 'smoke/**/*.mjs'],
    languageOptions: {
      globals: {
        ...nodeGlobals,
        require: 'readonly',
        module: 'writable',
      },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  prettier,
);
