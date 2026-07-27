/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  // @faker-js/faker 10.x ships ESM only (no `require` condition), which
  // Jest's CJS loader cannot parse — map it to a structural stub, mirroring
  // packages/vscode/jest.config.js. No test asserts on real faker output.
  moduleNameMapper: {
    '^@faker-js/faker$': '<rootDir>/src/test/__mocks__/faker.ts',
  },
};
