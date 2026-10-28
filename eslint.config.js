import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import tsEslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', '.next', 'functions/lib', '.claude']),
  // Build and maintenance scripts and config files (.mjs) are ES modules run by Node:
  // the recommended rules, with Node globals. src/lib/firestoreRest.mjs is shared with the
  // browser but uses no globals of either.
  {
    files: ['**/*.mjs'],
    extends: [js.configs.recommended],
    languageOptions: {
      globals: globals.node,
      sourceType: 'module',
      ecmaVersion: 'latest',
    },
    rules: {
      // Destructuring a key out with ...rest is how scripts drop a field from a copy.
      'no-unused-vars': ['error', { ignoreRestSiblings: true }],
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
      'no-unused-vars': 'error',
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
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
])
