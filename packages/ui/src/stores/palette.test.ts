import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../lib/palette/search', () => ({
  fuzzySearch: vi.fn(() => []),
  getAllRequests: vi.fn(() => []),
  initSearchEngine: vi.fn(),
}));

vi.mock('./collections.svelte', () => ({
  collections: vi.fn(() => []),
}));

vi.mock('./frecency.svelte', () => ({
  topRequests: vi.fn(() => []),
}));

import {
  palette,
  paletteOpen,
  paletteQuery,
  showingRecent,
  paletteResultsByType,
  initPaletteSearch,
  openPalette,
  closePalette,
  setPaletteQuery,
  selectPrevious,
  selectNext,
  setSelectedIndex,
  getSelected,
  togglePalette,
} from './palette.svelte';
import { fuzzySearch, initSearchEngine } from '../lib/palette/search';

describe('palette store', () => {
  beforeEach(() => {
    closePalette();
    vi.mocked(fuzzySearch).mockReturnValue([]);
    vi.mocked(initSearchEngine).mockClear();
  });

  describe('initial state', () => {
    it('should be closed', () => {
      expect(paletteOpen()).toBe(false);
    });

    it('should have empty query', () => {
      expect(paletteQuery()).toBe('');
    });

    it('should not be showing recent', () => {
      expect(showingRecent()).toBe(false);
    });

    it('should have empty results', () => {
      expect(palette().results).toEqual([]);
    });

    it('should have selectedIndex 0', () => {
      expect(palette().selectedIndex).toBe(0);
    });
  });

  describe('openPalette', () => {
    it('should set open to true', () => {
      openPalette();
      expect(paletteOpen()).toBe(true);
    });

    it('should set showingRecent to true', () => {
      openPalette();
      expect(showingRecent()).toBe(true);
    });

    it('should reset query to empty', () => {
      openPalette();
      expect(paletteQuery()).toBe('');
    });

    it('should reset selectedIndex to 0', () => {
      openPalette();
      expect(palette().selectedIndex).toBe(0);
    });
  });

  describe('closePalette', () => {
    it('should set open to false', () => {
      openPalette();
      closePalette();
      expect(paletteOpen()).toBe(false);
    });

    it('should reset all state', () => {
      openPalette();
      closePalette();
      expect(paletteQuery()).toBe('');
      expect(showingRecent()).toBe(false);
      expect(palette().results).toEqual([]);
      expect(palette().selectedIndex).toBe(0);
    });
  });

  describe('setPaletteQuery', () => {
    it('should set the query', () => {
      openPalette();
      setPaletteQuery('test');
      expect(paletteQuery()).toBe('test');
    });

    it('should show recent for empty query', () => {
      openPalette();
      setPaletteQuery('test');
      setPaletteQuery('');
      expect(showingRecent()).toBe(true);
    });

    it('should show recent for whitespace-only query', () => {
      openPalette();
      setPaletteQuery('   ');
      expect(showingRecent()).toBe(true);
    });

    it('should call fuzzySearch for non-empty query', () => {
      openPalette();
      setPaletteQuery('api');
      expect(fuzzySearch).toHaveBeenCalledWith('api');
    });

    it('should not show recent for non-empty query', () => {
      openPalette();
      setPaletteQuery('api');
      expect(showingRecent()).toBe(false);
    });

    it('should reset selectedIndex to 0', () => {
      openPalette();
      setPaletteQuery('test');
      expect(palette().selectedIndex).toBe(0);
    });

    it('should map fuzzySearch results to palette results', () => {
      const searchResults = [
        { item: { id: 'req-1', name: 'Get Users', method: 'GET', url: '/users', collectionId: 'col-1', collectionName: 'API', folderPath: '' }, score: 0.9 },
        { item: { id: 'req-2', name: 'Get Posts', method: 'GET', url: '/posts', collectionId: 'col-1', collectionName: 'API', folderPath: '' }, score: 0.8 },
      ];
      vi.mocked(fuzzySearch).mockReturnValue(searchResults as any);

      openPalette();
      setPaletteQuery('get');

      expect(palette().results).toHaveLength(2);
      expect(palette().results[0].type).toBe('request');
      expect(palette().results[0].id).toBe('req-1');
    });
  });

  describe('selectPrevious', () => {
    it('should decrement selectedIndex', () => {
      const results = [
        { item: { id: 'r1', name: 'A', method: 'GET', url: '/a', collectionId: 'c1', collectionName: 'C', folderPath: '' }, score: 1 },
        { item: { id: 'r2', name: 'B', method: 'GET', url: '/b', collectionId: 'c1', collectionName: 'C', folderPath: '' }, score: 0.9 },
      ];
      vi.mocked(fuzzySearch).mockReturnValue(results as any);

      openPalette();
      setPaletteQuery('test');

      // Move to index 1 first
      selectNext();
      expect(palette().selectedIndex).toBe(1);

      selectPrevious();
      expect(palette().selectedIndex).toBe(0);
    });

    it('should not go below 0', () => {
      openPalette();
      selectPrevious();
      expect(palette().selectedIndex).toBe(0);
    });
  });

  describe('selectNext', () => {
    it('should increment selectedIndex', () => {
      const results = [
        { item: { id: 'r1', name: 'A', method: 'GET', url: '/a', collectionId: 'c1', collectionName: 'C', folderPath: '' }, score: 1 },
        { item: { id: 'r2', name: 'B', method: 'GET', url: '/b', collectionId: 'c1', collectionName: 'C', folderPath: '' }, score: 0.9 },
      ];
      vi.mocked(fuzzySearch).mockReturnValue(results as any);

      openPalette();
      setPaletteQuery('test');

      selectNext();
      expect(palette().selectedIndex).toBe(1);
    });

    it('should not exceed results length', () => {
      const results = [
        { item: { id: 'r1', name: 'A', method: 'GET', url: '/a', collectionId: 'c1', collectionName: 'C', folderPath: '' }, score: 1 },
      ];
      vi.mocked(fuzzySearch).mockReturnValue(results as any);

      openPalette();
      setPaletteQuery('test');

      selectNext();
      selectNext();
      expect(palette().selectedIndex).toBe(0);
    });
  });

  describe('setSelectedIndex', () => {
    it('should set selected index directly', () => {
      const results = [
        { item: { id: 'r1', name: 'A', method: 'GET', url: '/a', collectionId: 'c1', collectionName: 'C', folderPath: '' }, score: 1 },
        { item: { id: 'r2', name: 'B', method: 'GET', url: '/b', collectionId: 'c1', collectionName: 'C', folderPath: '' }, score: 0.9 },
        { item: { id: 'r3', name: 'C', method: 'GET', url: '/c', collectionId: 'c1', collectionName: 'C', folderPath: '' }, score: 0.8 },
      ];
      vi.mocked(fuzzySearch).mockReturnValue(results as any);

      openPalette();
      setPaletteQuery('test');

      setSelectedIndex(2);
      expect(palette().selectedIndex).toBe(2);
    });

    it('should clamp to 0 for negative values', () => {
      openPalette();
      setSelectedIndex(-5);
      expect(palette().selectedIndex).toBe(0);
    });

    it('should clamp to results length - 1', () => {
      const results = [
        { item: { id: 'r1', name: 'A', method: 'GET', url: '/a', collectionId: 'c1', collectionName: 'C', folderPath: '' }, score: 1 },
      ];
      vi.mocked(fuzzySearch).mockReturnValue(results as any);

      openPalette();
      setPaletteQuery('test');

      setSelectedIndex(10);
      expect(palette().selectedIndex).toBe(0);
    });
  });

  describe('getSelected', () => {
    it('should return null when no results', () => {
      openPalette();
      expect(getSelected()).toBeNull();
    });

    it('should return selected result', () => {
      const results = [
        { item: { id: 'r1', name: 'A', method: 'GET', url: '/a', collectionId: 'c1', collectionName: 'C', folderPath: '' }, score: 1 },
        { item: { id: 'r2', name: 'B', method: 'GET', url: '/b', collectionId: 'c1', collectionName: 'C', folderPath: '' }, score: 0.9 },
      ];
      vi.mocked(fuzzySearch).mockReturnValue(results as any);

      openPalette();
      setPaletteQuery('test');

      const selected = getSelected();
      expect(selected).not.toBeNull();
      expect(selected!.id).toBe('r1');

      selectNext();
      expect(getSelected()!.id).toBe('r2');
    });
  });

  describe('togglePalette', () => {
    it('should open when closed', () => {
      togglePalette();
      expect(paletteOpen()).toBe(true);
    });

    it('should close when open', () => {
      openPalette();
      togglePalette();
      expect(paletteOpen()).toBe(false);
    });
  });

  describe('paletteResultsByType', () => {
    it('should group results by type', () => {
      const results = [
        { item: { id: 'r1', name: 'A', method: 'GET', url: '/a', collectionId: 'c1', collectionName: 'C', folderPath: '' }, score: 1 },
      ];
      vi.mocked(fuzzySearch).mockReturnValue(results as any);

      openPalette();
      setPaletteQuery('test');

      const grouped = paletteResultsByType();
      expect(grouped.request).toHaveLength(1);
      expect(grouped.recent).toHaveLength(0);
    });

    it('should return empty groups when no results', () => {
      openPalette();
      // Force empty results by closing and reopening
      closePalette();
      const grouped = paletteResultsByType();
      expect(grouped.request).toEqual([]);
      expect(grouped.recent).toEqual([]);
    });
  });

  describe('initPaletteSearch', () => {
    it('should call initSearchEngine with provided collections', () => {
      const cols = [{ id: 'col-1', name: 'Test', items: [] }];
      initPaletteSearch(cols);
      expect(initSearchEngine).toHaveBeenCalledWith(cols);
    });

    it('should not call initSearchEngine for empty collections', () => {
      initPaletteSearch([]);
      expect(initSearchEngine).not.toHaveBeenCalled();
    });
  });
});
