import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import tsEslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', '.next', 'functions/lib']),
  // Maintenance scripts are CommonJS and run in Node, not the browser. Lint with Node
  // globals so require/exports/process/console resolve.
  {
    files: ['scripts/**/*.js'],
    languageOptions: {
      globals: globals.node,
      sourceType: 'commonjs',
      ecmaVersion: 'latest',
    },
  },
  // Cloud Functions are TypeScript (functions/src → functions/lib) with their own
  // strict tsconfig. Type-check them against that project, with Node globals.
  {
    files: ['functions/**/*.ts'],
    extends: [
      js.configs.recommended,
      ...tsEslint.configs.recommended,
    ],
    languageOptions: {
      parser: tsEslint.parser,
      parserOptions: {
        project: ['./functions/tsconfig.json'],
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
      globals: globals.node,
    },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['**/*.{js,jsx}'],
    ignores: ['functions/**', 'scripts/**'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    // Cloud Functions .ts have their own block/tsconfig above.
    ignores: ['functions/**'],
    extends: [
      js.configs.recommended,
      ...tsEslint.configs.recommended,
      reactHooks.configs.flat.recommended,
    ],
    languageOptions: {
      parser: tsEslint.parser,
      parserOptions: {
        project: ['./tsconfig.json'],
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
      globals: globals.browser,
    },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]', argsIgnorePattern: '^[A-Z_]' }],
    },
  },
])
