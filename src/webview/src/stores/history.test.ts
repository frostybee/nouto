import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';
import {
  history,
  initHistory,
  addToHistory,
  clearHistory,
  deleteHistoryEntry,
  getHistoryEntry,
} from './history';
import type { HistoryEntry, ResponseData } from '../types';
import { vscodeApiMocks } from '../test/setup';

// Helper to create test data
const createMockRequest = (overrides = {}) => ({
  method: 'GET' as const,
  url: 'https://api.example.com/users',
  params: [],
  headers: [],
  auth: { type: 'none' as const },
  body: { type: 'none' as const, content: '' },
  ...overrides,
});

const createMockResponse = (overrides = {}): ResponseData => ({
  status: 200,
  statusText: 'OK',
  headers: { 'content-type': 'application/json' },
  data: { success: true },
  duration: 150,
  size: 256,
  ...overrides,
});

const createMockHistoryEntry = (id: string, overrides = {}): HistoryEntry => ({
  id,
  method: 'GET',
  url: 'https://api.example.com',
  params: [],
  headers: [],
  auth: { type: 'none' },
  body: { type: 'none', content: '' },
  status: 200,
  statusText: 'OK',
  duration: 100,
  size: 128,
  timestamp: new Date().toISOString(),
  ...overrides,
});

describe('history store', () => {
  beforeEach(() => {
    history.set([]);
    vscodeApiMocks.postMessage.mockClear();
  });

  describe('initHistory', () => {
    it('should initialize history with provided data', () => {
      const entries: HistoryEntry[] = [
        createMockHistoryEntry('1'),
        createMockHistoryEntry('2'),
      ];

      initHistory(entries);

      expect(get(history)).toEqual(entries);
    });

    it('should replace existing history', () => {
      history.set([createMockHistoryEntry('old')]);

      const newEntries: HistoryEntry[] = [createMockHistoryEntry('new')];
      initHistory(newEntries);

      expect(get(history)).toHaveLength(1);
      expect(get(history)[0].id).toBe('new');
    });
  });

  describe('addToHistory', () => {
    it('should add a new entry to history', () => {
      const request = createMockRequest();
      const response = createMockResponse();

      const entry = addToHistory(request, response);

      expect(entry).toBeDefined();
      expect(entry.method).toBe('GET');
      expect(entry.url).toBe('https://api.example.com/users');
      expect(entry.status).toBe(200);
    });

    it('should add entry at the beginning (most recent first)', () => {
      const entries: HistoryEntry[] = [createMockHistoryEntry('existing')];
      initHistory(entries);

      const request = createMockRequest({ url: 'https://new-url.com' });
      const response = createMockResponse();

      addToHistory(request, response);

      const hist = get(history);
      expect(hist[0].url).toBe('https://new-url.com');
      expect(hist[1].id).toBe('existing');
    });

    it('should notify extension to persist', () => {
      addToHistory(createMockRequest(), createMockResponse());

      expect(vscodeApiMocks.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'saveHistory',
        })
      );
    });

    it('should limit history to 100 entries', () => {
      // Fill with 100 entries
      const entries: HistoryEntry[] = [];
      for (let i = 0; i < 100; i++) {
        entries.push(createMockHistoryEntry(`entry-${i}`));
      }
      initHistory(entries);

      // Add one more
      addToHistory(createMockRequest(), createMockResponse());

      expect(get(history)).toHaveLength(100);
    });

    it('should preserve request data correctly', () => {
      const request = createMockRequest({
        method: 'POST',
        params: [{ id: '1', key: 'page', value: '1', enabled: true }],
        headers: [{ id: '2', key: 'Authorization', value: 'Bearer token', enabled: true }],
        auth: { type: 'bearer', token: 'test-token' },
        body: { type: 'json', content: '{"test": true}' },
      });
      const response = createMockResponse({ status: 201 });

      const entry = addToHistory(request, response);

      expect(entry.method).toBe('POST');
      expect(entry.params).toEqual(request.params);
      expect(entry.headers).toEqual(request.headers);
      expect(entry.auth).toEqual(request.auth);
      expect(entry.body).toEqual(request.body);
      expect(entry.status).toBe(201);
    });
  });

  describe('clearHistory', () => {
    it('should clear all history entries', () => {
      initHistory([
        createMockHistoryEntry('1'),
        createMockHistoryEntry('2'),
        createMockHistoryEntry('3'),
      ]);

      clearHistory();

      expect(get(history)).toEqual([]);
    });

    it('should notify extension with empty history', () => {
      clearHistory();

      expect(vscodeApiMocks.postMessage).toHaveBeenCalledWith({
        type: 'saveHistory',
        data: [],
      });
    });
  });

  describe('deleteHistoryEntry', () => {
    it('should delete a specific entry', () => {
      initHistory([
        createMockHistoryEntry('1'),
        createMockHistoryEntry('2'),
        createMockHistoryEntry('3'),
      ]);

      deleteHistoryEntry('2');

      const hist = get(history);
      expect(hist).toHaveLength(2);
      expect(hist.find(e => e.id === '2')).toBeUndefined();
    });

    it('should not affect other entries', () => {
      initHistory([
        createMockHistoryEntry('1'),
        createMockHistoryEntry('2'),
      ]);

      deleteHistoryEntry('1');

      const hist = get(history);
      expect(hist).toHaveLength(1);
      expect(hist[0].id).toBe('2');
    });

    it('should handle deleting non-existent entry gracefully', () => {
      initHistory([createMockHistoryEntry('1')]);

      deleteHistoryEntry('non-existent');

      expect(get(history)).toHaveLength(1);
    });

    it('should notify extension to persist', () => {
      initHistory([createMockHistoryEntry('1')]);
      vscodeApiMocks.postMessage.mockClear();

      deleteHistoryEntry('1');

      expect(vscodeApiMocks.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'saveHistory',
        })
      );
    });
  });

  describe('getHistoryEntry', () => {
    it('should return entry by ID', () => {
      const entries = [
        createMockHistoryEntry('1', { url: 'https://first.com' }),
        createMockHistoryEntry('2', { url: 'https://second.com' }),
      ];
      initHistory(entries);

      const entry = getHistoryEntry('2');

      expect(entry).toBeDefined();
      expect(entry?.url).toBe('https://second.com');
    });

    it('should return undefined for non-existent ID', () => {
      initHistory([createMockHistoryEntry('1')]);

      const entry = getHistoryEntry('non-existent');

      expect(entry).toBeUndefined();
    });

    it('should return undefined when history is empty', () => {
      const entry = getHistoryEntry('any');

      expect(entry).toBeUndefined();
    });
  });
});
