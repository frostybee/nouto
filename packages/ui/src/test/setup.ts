import { vi, beforeEach } from 'vitest';

// Mock the VS Code API
const mockPostMessage = vi.fn();
const mockGetState = vi.fn();
const mockSetState = vi.fn();

(globalThis as any).window = {
  ...globalThis.window,
  vscode: {
    postMessage: mockPostMessage,
    getState: mockGetState,
    setState: mockSetState,
  },
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
};

// Export mocks for test assertions
export const vscodeApiMocks = {
  postMessage: mockPostMessage,
  getState: mockGetState,
  setState: mockSetState,
};

// Reset mocks before each test
beforeEach(() => {
  mockPostMessage.mockClear();
  mockGetState.mockClear();
  mockSetState.mockClear();
});
