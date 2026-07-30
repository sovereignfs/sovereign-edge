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
};
