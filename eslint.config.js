// Flat config, matching the wider sovereignfs ecosystem's ESLint 9 setup.
// Prettier is the formatting source of truth — eslint-config-prettier is last
// so it disables every stylistic rule the other configs turn on.
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const prettierConfig = require('eslint-config-prettier/flat');
const globals = require('globals');

module.exports = defineConfig([
  expoConfig,
  prettierConfig,
  {
    ignores: ['node_modules/', 'ios/', 'android/', '.expo/', 'dist/'],
  },
  {
    files: ['**/*.test.ts', '**/*.test.tsx', 'jest.setup.js'],
    languageOptions: { globals: globals.jest },
  },
]);
