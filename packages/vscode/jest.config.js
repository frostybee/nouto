/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts'],
  testPathIgnorePatterns: ['/node_modules/'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  collectCoverageFrom: [
    'src/services/StorageService.ts',
    'src/services/FileService.ts',
    'src/services/EnvFileService.ts',
    'src/services/SecretStorageService.ts',
    'src/services/DraftService.ts',
    'src/services/OpenApiImportService.ts',
    'src/services/ImportExportService.ts',
    'src/services/storage/**/*.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  moduleNameMapper: {
    '^vscode$': '<rootDir>/src/test/__mocks__/vscode.ts',
  },
  setupFilesAfterEnv: ['<rootDir>/src/test/setup.ts'],
};
