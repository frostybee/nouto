import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@hivefetch/core', () => ({
  formatData: vi.fn(),
}));

import { formatData } from '@hivefetch/core';
import {
  previousResponseBody,
  previousResponseLabel,
  capturePreviousResponse,
} from './responseDiff.svelte';

const mockFormatData = vi.mocked(formatData);

describe('responseDiff store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset state by capturing with a falsy return
    mockFormatData.mockReturnValue(null as any);
    capturePreviousResponse(null);
  });

  describe('initial state', () => {
    it('should start with null body', () => {
      expect(previousResponseBody()).toBeNull();
    });

    it('should start with empty label', () => {
      expect(previousResponseLabel()).toBe('');
    });
  });

  describe('capturePreviousResponse', () => {
    it('should store formatted data and default label', () => {
      mockFormatData.mockReturnValue('{"id": 1}');
      capturePreviousResponse({ id: 1 });
      expect(mockFormatData).toHaveBeenCalledWith({ id: 1 });
      expect(previousResponseBody()).toBe('{"id": 1}');
      expect(previousResponseLabel()).toBe('Previous');
    });

    it('should use a custom label when provided', () => {
      mockFormatData.mockReturnValue('formatted');
      capturePreviousResponse('data', 'Response #3');
      expect(previousResponseLabel()).toBe('Response #3');
    });

    it('should not update state when formatData returns a falsy value', () => {
      // First set valid data
      mockFormatData.mockReturnValue('valid');
      capturePreviousResponse('something');
      expect(previousResponseBody()).toBe('valid');

      // Then try with falsy return
      mockFormatData.mockReturnValue(null as any);
      capturePreviousResponse(null);
      // State should remain unchanged
      expect(previousResponseBody()).toBe('valid');
    });

    it('should overwrite previous capture', () => {
      mockFormatData.mockReturnValue('first');
      capturePreviousResponse('a', 'First');
      expect(previousResponseBody()).toBe('first');

      mockFormatData.mockReturnValue('second');
      capturePreviousResponse('b', 'Second');
      expect(previousResponseBody()).toBe('second');
      expect(previousResponseLabel()).toBe('Second');
    });
  });
});
