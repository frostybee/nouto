import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./responseDiff.svelte', () => ({
  capturePreviousResponse: vi.fn(),
}));

import {
  response,
  isLoading,
  downloadProgress,
  setDownloadProgress,
  setResponse,
  setLoading,
  clearResponse,
  formatBytes,
  categorizeError,
} from './response.svelte';
import { capturePreviousResponse } from './responseDiff.svelte';

describe('response store', () => {
  beforeEach(() => {
    clearResponse();
    setLoading(false);
    vi.mocked(capturePreviousResponse).mockClear();
  });

  describe('initial state', () => {
    it('should have null response', () => {
      expect(response()).toBeNull();
    });

    it('should not be loading', () => {
      expect(isLoading()).toBe(false);
    });

    it('should have null download progress', () => {
      expect(downloadProgress()).toBeNull();
    });
  });

  describe('setResponse', () => {
    const mockResponse = {
      status: 200,
      statusText: 'OK',
      headers: { 'content-type': 'application/json' },
      data: '{"key": "value"}',
      duration: 150,
      size: 1024,
    };

    it('should set the response', () => {
      setResponse(mockResponse);
      expect(response()).toEqual(mockResponse);
    });

    it('should set loading to false', () => {
      setLoading(true);
      setResponse(mockResponse);
      expect(isLoading()).toBe(false);
    });

    it('should clear download progress', () => {
      setDownloadProgress(500, 1000);
      setResponse(mockResponse);
      expect(downloadProgress()).toBeNull();
    });

    it('should capture previous response when current has data and no error', () => {
      const firstResponse = { ...mockResponse, data: 'first' };
      setResponse(firstResponse);

      const secondResponse = { ...mockResponse, data: 'second' };
      setResponse(secondResponse);

      expect(capturePreviousResponse).toHaveBeenCalledWith('first');
    });

    it('should not capture previous response when current has error', () => {
      const errorResponse = { ...mockResponse, data: 'error data', error: true };
      setResponse(errorResponse);

      const secondResponse = { ...mockResponse, data: 'second' };
      setResponse(secondResponse);

      expect(capturePreviousResponse).not.toHaveBeenCalled();
    });

    it('should not capture previous response when current data is falsy', () => {
      const emptyResponse = { ...mockResponse, data: null };
      setResponse(emptyResponse);

      const secondResponse = { ...mockResponse, data: 'second' };
      setResponse(secondResponse);

      expect(capturePreviousResponse).not.toHaveBeenCalled();
    });
  });

  describe('setLoading', () => {
    it('should set loading to true', () => {
      setLoading(true);
      expect(isLoading()).toBe(true);
    });

    it('should set loading to false', () => {
      setLoading(true);
      setLoading(false);
      expect(isLoading()).toBe(false);
    });

    it('should clear download progress when loading is set to false', () => {
      setDownloadProgress(500, 1000);
      setLoading(false);
      expect(downloadProgress()).toBeNull();
    });
  });

  describe('clearResponse', () => {
    it('should clear response to null', () => {
      setResponse({
        status: 200,
        statusText: 'OK',
        headers: {},
        data: 'test',
        duration: 100,
        size: 50,
      });
      clearResponse();
      expect(response()).toBeNull();
    });

    it('should clear download progress', () => {
      setDownloadProgress(500, 1000);
      clearResponse();
      expect(downloadProgress()).toBeNull();
    });
  });

  describe('setDownloadProgress', () => {
    it('should set download progress with total', () => {
      setDownloadProgress(500, 1000);
      expect(downloadProgress()).toEqual({ loaded: 500, total: 1000 });
    });

    it('should set download progress with null total', () => {
      setDownloadProgress(500, null);
      expect(downloadProgress()).toEqual({ loaded: 500, total: null });
    });
  });

  describe('formatBytes', () => {
    it('should format bytes', () => {
      expect(formatBytes(0)).toBe('0 B');
      expect(formatBytes(500)).toBe('500 B');
      expect(formatBytes(1023)).toBe('1023 B');
    });

    it('should format kilobytes', () => {
      expect(formatBytes(1024)).toBe('1.0 KB');
      expect(formatBytes(2048)).toBe('2.0 KB');
      expect(formatBytes(1536)).toBe('1.5 KB');
    });

    it('should format megabytes', () => {
      expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
      expect(formatBytes(1024 * 1024 * 2.5)).toBe('2.5 MB');
    });
  });

  describe('categorizeError', () => {
    it('should categorize timeout errors', () => {
      expect(categorizeError('Request timeout').category).toBe('timeout');
      expect(categorizeError('ETIMEDOUT').category).toBe('timeout');
      expect(categorizeError('Connection timed out').category).toBe('timeout');
    });

    it('should categorize DNS errors', () => {
      expect(categorizeError('ENOTFOUND').category).toBe('dns');
      expect(categorizeError('getaddrinfo failed').category).toBe('dns');
      expect(categorizeError('DNS lookup failed').category).toBe('dns');
    });

    it('should categorize SSL errors', () => {
      expect(categorizeError('SSL error').category).toBe('ssl');
      expect(categorizeError('Certificate expired').category).toBe('ssl');
      expect(categorizeError('Self signed certificate').category).toBe('ssl');
      expect(categorizeError('Unable to verify certificate').category).toBe('ssl');
    });

    it('should categorize connection refused errors', () => {
      const result = categorizeError('ECONNREFUSED');
      expect(result.category).toBe('connection');
      expect(result.message).toBe('Connection refused');
    });

    it('should categorize connection reset errors', () => {
      const result = categorizeError('ECONNRESET');
      expect(result.category).toBe('connection');
      expect(result.message).toBe('Connection was reset');
    });

    it('should categorize network unreachable errors', () => {
      const result = categorizeError('ENETUNREACH');
      expect(result.category).toBe('network');
      expect(result.message).toBe('Network unreachable');
    });

    it('should categorize general network errors', () => {
      expect(categorizeError('Network error occurred').category).toBe('network');
      expect(categorizeError('Socket hang up').category).toBe('network');
      expect(categorizeError('EPIPE broken').category).toBe('network');
    });

    it('should categorize server errors by status code', () => {
      const result = categorizeError('Internal Server Error', 500);
      expect(result.category).toBe('server');
      expect(result.message).toBe('Server error (500)');
    });

    it('should categorize 502 as server error', () => {
      const result = categorizeError('Bad Gateway', 502);
      expect(result.category).toBe('server');
    });

    it('should return unknown for unrecognized errors', () => {
      const result = categorizeError('Something went wrong');
      expect(result.category).toBe('unknown');
      expect(result.message).toBe('Something went wrong');
    });

    it('should return unknown with default message for empty error', () => {
      const result = categorizeError('');
      expect(result.category).toBe('unknown');
      expect(result.message).toBe('An unknown error occurred');
    });
  });
});
