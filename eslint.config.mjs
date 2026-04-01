import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

export default [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),

  // ── Module boundary enforcement ──────────────────────────────
  {
    files: ['src/components/**/*.ts', 'src/components/**/*.tsx'],
    rules: {
      'no-restricted-imports': ['warn', {
        paths: [
          { name: '@/lib/shared/db-client', message: 'Components must not import db-client directly. Use hooks instead.' },
          { name: '@/lib/shared/db-server', message: 'Components must not use server DB client.' },
        ],
        patterns: [
          { group: ['@/lib/kb/*'], message: 'Components must access KB through hooks, not directly.' },
          { group: ['@/lib/bot/*'], message: 'Components must access bot through hooks, not directly.' },
        ],
      }],
    },
  },

  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'out/**',
      'coverage/**',
      'data/**',
      'data_sources/**',
      'supabase/**',
      'sql/**',
      'public/fonts/**',
      '*.config.js',
      '*.config.ts',
      'next-env.d.ts',
      'src/types/supabase.ts',
      'scripts/**',
      'tests/**',
      'server.js',
      'eslint.config.mjs',
    ],
  },
];
