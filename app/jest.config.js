/**
 * Unit tests cover the logic behind the screens (request parsing, mobile ID import,
 * vault, relay answers, circuit inputs) with every native module behind a
 * port, so a plain node environment is enough. Screens are checked on the
 * simulator, not here.
 */
module.exports = {
  testEnvironment: 'node',
  transform: {'^.+\\.[jt]sx?$': 'babel-jest'},
  testMatch: ['<rootDir>/src/**/__tests__/**/*.test.ts'],
  modulePathIgnorePatterns: ['<rootDir>/mopro_bindings/'],
  // @kproof/sdk is a symlink to ../sdk: its files are transformed here, and the
  // helpers Babel adds (@babel/runtime) are resolved from the app's packages.
  modulePaths: ['<rootDir>/node_modules'],
  // The package's own in-memory stand-in; the native module does not exist under node.
  moduleNameMapper: {
    '^@react-native-async-storage/async-storage$': '@react-native-async-storage/async-storage/jest/async-storage-mock',
  },
  // The SDK's hash library ships ES modules only.
  transformIgnorePatterns: ['/node_modules/(?!@noble/hashes/)'],
};
