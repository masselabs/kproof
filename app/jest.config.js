/**
 * Unit tests cover the logic behind the screens (request parsing, RAON flow,
 * vault, relay answers, circuit inputs) with every native module behind a
 * port, so a plain node environment is enough. Screens are checked on the
 * simulator, not here.
 */
module.exports = {
  testEnvironment: 'node',
  transform: {'^.+\\.[jt]sx?$': 'babel-jest'},
  testMatch: ['<rootDir>/src/**/__tests__/**/*.test.ts'],
  modulePathIgnorePatterns: ['<rootDir>/mopro_bindings/'],
};
