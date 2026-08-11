// jest-expo handles React Native's transform pipeline (Flow types in RN
// source, Metro-style module resolution) — see the test-runner decision in
// docs/research/0002-react-native-framework-choice.md.
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    // jest-expo's preset only maps a transform for .js/.jsx/.ts/.tsx
    // (`\.[jt]sx?$`), not .mjs — so lucide-react-native's package.json
    // "react-native"/"import" condition (an untransformed ESM .mjs bundle)
    // hits Jest's CJS `require()` raw and fails on the first `export`
    // statement. Its plain-CJS build needs no transform at all, so route
    // straight to that instead of teaching Jest a new file extension.
    '^lucide-react-native$':
      '<rootDir>/node_modules/lucide-react-native/dist/cjs/lucide-react-native.js',
  },
  collectCoverageFrom: ['src/**/*.{ts,tsx}', 'App.tsx'],
  testPathIgnorePatterns: ['/node_modules/', '/ios/', '/android/'],
  // @noble/hashes, @react-navigation, and lucide-react-native are ESM-only,
  // so Jest must transform them rather than skip them as node_modules
  // dependencies. Matched by substring because pnpm resolves each through a
  // .pnpm/<pkg>@<version> path rather than a plain node_modules/<pkg> one.
  transformIgnorePatterns: [
    'node_modules/(?!.*(@noble[+/]hashes|@react-navigation|lucide-react-native|react-native|@react-native|expo|@expo))',
  ],
};
