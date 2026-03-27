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
