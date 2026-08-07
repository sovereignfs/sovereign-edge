// Flat config, matching the wider sovereignfs ecosystem's ESLint 9 setup —
// same shape as apps/mobile/eslint.config.js, but for React DOM (Tauri's
// webview) rather than React Native, so the base config differs even though
// the layering convention (typed rules, then Prettier last to disable every
// stylistic rule the others turn on) does not. ESM import, not require: this
// package is `"type": "module"` (Vite's own config is ESM), unlike mobile's
// CommonJS Expo/Metro setup.
import { defineConfig } from 'eslint/config';
import prettierConfig from 'eslint-config-prettier/flat';
import react from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  tseslint.configs.recommended,
  {
    // Not `react.configs['recommended-latest']` directly: that config ships
    // `plugins` as an array of plugin *names* (the pre-flat-config eslintrc
    // shape), which `defineConfig` rejects outright. Reusing its rule set
    // under a manually-built flat `plugins` object sidesteps the package's
    // own export bug rather than working around it with the eslintrc
    // compatibility shim.
    plugins: { 'react-hooks': react },
    rules: react.configs['recommended-latest'].rules,
  },
  reactRefresh.configs.vite,
  prettierConfig,
  {
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
  },
  {
    ignores: ['node_modules/', 'dist/', 'src-tauri/'],
  },
]);
