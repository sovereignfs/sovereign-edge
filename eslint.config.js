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
  {
    // Epic task 7.2's review checklist — "no screen hardcodes a color …
    // outside the theme module" — as a check rather than a habit. Colours are
    // the enforceable part: a hex or rgba() literal is unambiguous, whereas a
    // bare `12` could be a colour, a line count, or a timeout.
    //
    // `src/design-system/` is exempt because defining these values is its job.
    files: ['src/**/*.ts', 'src/**/*.tsx', 'App.tsx'],
    ignores: ['src/design-system/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=/^(#[0-9a-fA-F]{3,8}|rgba?\\(|hsla?\\()/]',
          message:
            'Use a semantic token from `useTheme()` instead of a colour ' +
            'literal. If a new colour is genuinely needed, add it to ' +
            'src/design-system/semantic.ts so both light and dark are defined.',
        },
      ],
    },
  },
]);
