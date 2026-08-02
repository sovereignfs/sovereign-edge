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
    // CI helpers are plain Node scripts, not React Native code.
    files: ['scripts/**/*.js'],
    languageOptions: { globals: globals.node, sourceType: 'commonjs' },
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
  {
    // Task 1.5, threats 1 and 2: the offline boundary around `src/chat/`.
    //
    // Research 0001 states that no network code path exists in the chat and
    // model layers. This turns that from an intention into a check — see
    // docs/network-audit.md for what these rules do and do not cover.
    //
    // The globals matter more than the imports here. `fetch`, `WebSocket`,
    // `XMLHttpRequest` and `EventSource` are ambient in React Native, so a
    // file under `src/chat/` can reach the network without importing
    // anything at all. Import rules alone would miss the likeliest breakage.
    files: ['src/chat/**/*.ts', 'src/chat/**/*.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'expo-file-system',
              message:
                'src/chat/ must not import expo-file-system: it carries ' +
                'DownloadTask. Model files are the responsibility of ' +
                'src/models/, which chat reaches only through the injected ' +
                'ChatSessionContext.',
            },
            {
              name: 'expo-network',
              message: 'src/chat/ must not observe or use the network.',
            },
          ],
          patterns: [
            {
              group: [
                '@/models',
                '@/models/**',
                '**/models/**',
                '@/connectors',
                '@/connectors/**',
                '**/connectors/**',
              ],
              message:
                'src/chat/ must not import src/models/ or src/connectors/ — ' +
                'both reach the network. The dependency is inverted through ' +
                'ChatSessionContext, which the app shell implements.',
            },
            {
              group: ['axios', 'node-fetch', 'undici', 'superagent', 'ky'],
              message: 'src/chat/ must not import an HTTP client.',
            },
            {
              group: ['expo/fetch'],
              message:
                "Expo's streaming fetch is still a socket. src/chat/ is " +
                'offline by design.',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        {
          name: 'fetch',
          message:
            'src/chat/ is offline by design (research 0001). Network access ' +
            'belongs in src/connectors/, behind a per-connector grant.',
        },
        {
          name: 'XMLHttpRequest',
          message: 'src/chat/ is offline by design (research 0001).',
        },
        {
          name: 'WebSocket',
          message: 'src/chat/ is offline by design (research 0001).',
        },
        {
          name: 'EventSource',
          message: 'src/chat/ is offline by design (research 0001).',
        },
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'navigator',
          property: 'sendBeacon',
          message:
            'sendBeacon is a network call that deliberately outlives the ' +
            'page. src/chat/ is offline by design (research 0001).',
        },
        {
          object: 'globalThis',
          property: 'fetch',
          message:
            'Reaching fetch through globalThis does not make it local. ' +
            'src/chat/ is offline by design (research 0001).',
        },
      ],
    },
  },
]);
