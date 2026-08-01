// jest-expo handles React Native's transform pipeline (Flow types in RN
// source, Metro-style module resolution) — see the test-runner decision in
// docs/research/0002-react-native-framework-choice.md.
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  collectCoverageFrom: ['src/**/*.{ts,tsx}', 'App.tsx'],
  testPathIgnorePatterns: ['/node_modules/', '/ios/', '/android/'],
  // @noble/hashes and @react-navigation are ESM-only, so Jest must
  // transform it rather than skip it as a node_modules dependency. Matched by
  // substring because pnpm resolves it through a .pnpm/@noble+hashes@x path
  // rather than a plain node_modules/@noble/hashes one.
  transformIgnorePatterns: [
    'node_modules/(?!.*(@noble[+/]hashes|@react-navigation|react-native|@react-native|expo|@expo))',
  ],
};
