// Jest test setup

// Extend Jest timeout for async operations
jest.setTimeout(10000);

// Mock console methods to reduce noise during tests
beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterAll(() => {
  jest.restoreAllMocks();
});

// Clean up between tests
afterEach(() => {
  jest.clearAllMocks();
});
