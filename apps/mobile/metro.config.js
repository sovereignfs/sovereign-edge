const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// lucide-react-native's package.json "react-native"/"import" export
// condition points Metro at an ESM barrel (dist/esm/lucide-react-native.mjs)
// whose relative re-exports of ./icons/*.mjs don't resolve cleanly through
// Metro's bundler resolver (same underlying ESM/Metro interop gap Jest hit
// running the same package — jest.config.js's moduleNameMapper carries the
// matching fix and the same reasoning). The package's plain-CJS build needs
// no special resolution and is functionally identical: same icon path
// data, same props.
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  'lucide-react-native': path.resolve(
    __dirname,
    'node_modules/lucide-react-native/dist/cjs/lucide-react-native.js',
  ),
};

module.exports = config;
