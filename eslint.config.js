import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import astro from 'eslint-plugin-astro';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default [
  {
    ignores: [
      'dist/**',
      '.astro/**',
      'node_modules/**',
      '.husky/**',
      '.claude/**',
      '.superpowers/**',
      'package-lock.json',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...astro.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      // Pragmatic relaxations so the existing simple site passes cleanly.
      // The inline <script is:inline> blocks use legacy browser patterns
      // (var, IIFE, `arguments`, short-circuit calls) that we do not want
      // to rewrite in the tooling PR.
      'no-var': 'off',
      'prefer-const': 'warn',
      // Inline browser scripts intentionally use the `arguments` object to
      // wrap native APIs (console, fetch) without changing their arity.
      'prefer-rest-params': 'off',
      // env.d.ts uses the standard Astro-generated triple-slash reference.
      '@typescript-eslint/triple-slash-reference': 'off',
      'no-unused-expressions': ['error', { allowShortCircuit: true, allowTernary: true }],
      '@typescript-eslint/no-unused-expressions': ['error', { allowShortCircuit: true, allowTernary: true }],
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-empty': ['warn', { allowEmptyCatch: true }],
      // forecast.astro intentionally strips ASCII control characters
      // (\x00-\x1f, \x7f) from location names before injecting them into
      // the DOM — a deliberate input-sanitization safeguard, not an
      // accidental control char. This is a heuristic style rule, not a
      // correctness rule, so allow control chars in regex literals.
      'no-control-regex': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  prettier,
];
