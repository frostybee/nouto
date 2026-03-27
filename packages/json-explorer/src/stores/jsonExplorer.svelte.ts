/**
 * JSON Explorer store - central state management for the JSON Explorer panel.
 *
 * Svelte 5 module rule: $derived cannot be exported directly from .svelte.ts files.
 * All derived values are private; exported via getter functions.
 */

import { flattenJson, DEFAULT_PAGE_SIZE, type FlatNode } from '../lib/flatten';
import { getParentPath, pathToSegments, type PathSegment } from '../lib/path-utils';
import { searchJson, type SearchMatch } from '../lib/search';
import { fuzzySearchJson } from '../lib/fuzzy-search';
import { filterByJsonPath } from '@nouto/core';

export type { FlatNode } from '../lib/flatten';
export type { PathSegment } from '../lib/path-utils';
export type { SearchMatch } from '../lib/search';

export interface JsonExplorerInitData {
  json: any;
  contentType: string;
  requestName?: string;
  requestMethod?: string;
  requestUrl?: string;
  requestId?: string;
  panelId?: string;
  timestamp?: string;
}

// ---- State ----

let _rawJson = $state<any>(undefined);
let _contentType = $state('');
let _requestName = $state('');
let _requestMethod = $state('');
let _requestUrl = $state('');
let _requestId = $state('');
let _panelId = $state('');
let _timestamp = $state('');

let _expandedPaths = $state(new Set<string>());
let _arrayPageMap = $state(new Map<string, number>());
let _selectedPath = $state<string | null>(null);

// Search
let _searchQuery = $state('');
let _searchRegex = $state(false);
let _searchCaseSensitive = $state(false);
let _searchScope = $state<'all' | 'keys' | 'values'>('all');
let _searchCurrentIndex = $state(0);
let _searchFuzzy = $state(false);

// JSONPath filter
let _jsonPathQuery = $state('');
let _jsonPathError = $state<string | null>(null);
let _jsonPathMatchCount = $state(0);
let _jsonPathFilteredJson = $state<any>(undefined);

// Modes
let _filterMode = $state<'highlight' | 'filter'>('highlight');
let _viewMode = $state<'tree' | 'table' | 'diff'>('tree');

// Diff
let _comparisonJson = $state<any>(undefined);

// Persistence
let _searchHistory = $state<string[]>([]);
let _bookmarks = $state<string[]>([]);

const PAGE_SIZE = DEFAULT_PAGE_SIZE;
const MAX_SEARCH_HISTORY = 20;

// ---- Private Derived ----

const _effectiveJson = $derived.by(() => {
  if (_jsonPathFilteredJson !== undefined) return _jsonPathFilteredJson;
  return _rawJson;
});

const _searchResults: SearchMatch[] = $derived.by(() => {
  if (!_searchQuery || _rawJson === undefined) return [];
  if (_searchFuzzy) {
    const fuzzyResults = fuzzySearchJson(_rawJson, _searchQuery, { scope: _searchScope });
    return fuzzyResults.map(r => ({ path: r.path, matchIn: r.matchIn, matchText: r.matchText }));
  }
  return searchJson(_rawJson, _searchQuery, {
    regex: _searchRegex,
    caseSensitive: _searchCaseSensitive,
    scope: _searchScope,
  });
});

const _searchMatchPaths: Set<string> = $derived.by(() => {
  return new Set(_searchResults.map(m => m.path));
});

const _flatNodes: FlatNode[] = $derived.by(() => {
  if (_effectiveJson === undefined) return [];
  if (_filterMode === 'filter' && _searchQuery && _searchMatchPaths.size > 0) {
    const pruned = pruneToMatches(_effectiveJson, _searchMatchPaths);
    if (pruned !== undefined) {
      return flattenJson(pruned, _expandedPaths, _arrayPageMap);
    }
  }
  return flattenJson(_effectiveJson, _expandedPaths, _arrayPageMap);
});

const _breadcrumbSegments: PathSegment[] = $derived.by(() => {
  if (!_selectedPath) return pathToSegments('$');
  return pathToSegments(_selectedPath);
});

const _totalNodeCount = $derived.by(() => {
  if (_rawJson === undefined) return 0;
  return countNodes(_rawJson);
});

const _isTableable = $derived.by(() => {
  const json = _effectiveJson;
  if (json === undefined) return false;
  if (!Array.isArray(json)) return false;
  if (json.length === 0) return false;
  return json[0] !== null && typeof json[0] === 'object' && !Array.isArray(json[0]);
});

const _tableData: any[] = $derived.by(() => {
  const json = _effectiveJson;
  if (!Array.isArray(json)) return [];
  return json;
});

const _explorerState = $derived({
  rawJson: _rawJson,
  contentType: _contentType,
  requestName: _requestName,
  requestMethod: _requestMethod,
  requestUrl: _requestUrl,
  requestId: _requestId,
  panelId: _panelId,
  timestamp: _timestamp,
});

// ---- Exported Getters (functions returning current derived value) ----

export function explorerState() { return _explorerState; }
export function flatNodes() { return _flatNodes; }
export function selectedPath() { return _selectedPath; }
export function breadcrumbSegments() { return _breadcrumbSegments; }
export function totalNodeCount() { return _totalNodeCount; }
export function searchResults() { return _searchResults; }
export function searchCurrentIndex() { return _searchCurrentIndex; }
export function searchQuery() { return _searchQuery; }
export function searchMatchPaths() { return _searchMatchPaths; }
export function searchFuzzy() { return _searchFuzzy; }
export function filterMode() { return _filterMode; }
export function viewMode() { return _viewMode; }
export function comparisonJson() { return _comparisonJson; }
export function isTableable() { return _isTableable; }
export function tableData() { return _tableData; }
export function jsonPathQuery() { return _jsonPathQuery; }
export function jsonPathError() { return _jsonPathError; }
export function jsonPathMatchCount() { return _jsonPathMatchCount; }
export function searchHistory() { return _searchHistory; }
export function bookmarks() { return _bookmarks; }

// ---- Actions ----

export function initJsonExplorer(data: JsonExplorerInitData): void {
  const json = typeof data.json === 'string'
    ? (() => { try { return JSON.parse(data.json); } catch { return data.json; } })()
    : data.json;

  _rawJson = json;
  _contentType = data.contentType || '';
  _requestName = data.requestName || '';
  _requestMethod = data.requestMethod || '';
  _requestUrl = data.requestUrl || '';
  _requestId = data.requestId || '';
  _panelId = data.panelId || '';
  _timestamp = data.timestamp || '';
  _expandedPaths = new Set<string>(['$']);
  _arrayPageMap = new Map<string, number>();
  _selectedPath = null;
}

export function toggleNode(path: string): void {
  const next = new Set(_expandedPaths);
  if (next.has(path)) {
    for (const p of next) {
      if (p === path || p.startsWith(path + '.') || p.startsWith(path + '[')) {
        next.delete(p);
      }
    }
  } else {
    next.add(path);
  }
  _expandedPaths = next;
}

export function expandAll(): void {
  const json = _effectiveJson;
  if (json === undefined) return;
  const paths = new Set<string>();
  collectExpandablePaths(json, '$', paths);
  _expandedPaths = paths;
}

export function collapseAll(): void {
  _expandedPaths = new Set<string>(['$']);
}

export function expandToDepth(maxDepth: number): void {
  const json = _effectiveJson;
  if (json === undefined) return;
  const paths = new Set<string>();
  collectExpandablePathsToDepth(json, '$', 0, maxDepth, paths);
  _expandedPaths = paths;
}

export function selectNode(path: string | null): void {
  _selectedPath = path;
}

export function showMoreItems(arrayPath: string): void {
  const cleanPath = arrayPath.replace(/\.__showMore__$/, '');
  const current = _arrayPageMap.get(cleanPath) ?? PAGE_SIZE;
  const next = new Map(_arrayPageMap);
  next.set(cleanPath, current + PAGE_SIZE);
  _arrayPageMap = next;
}

export function navigateToBreadcrumb(path: string): void {
  _selectedPath = path;
  const next = new Set(_expandedPaths);
  const segments = pathToSegments(path);
  for (const seg of segments) next.add(seg.path);
  _expandedPaths = next;
}

export function navigateToParent(): void {
  if (!_selectedPath || _selectedPath === '$') return;
  _selectedPath = getParentPath(_selectedPath);
}

// ---- Search ----

export function setSearchQuery(query: string): void {
  _searchQuery = query;
  _searchCurrentIndex = 0;
  if (query.trim()) addToSearchHistory(query);
}

export function setSearchOptions(opts: { regex?: boolean; caseSensitive?: boolean; scope?: 'all' | 'keys' | 'values'; fuzzy?: boolean }): void {
  if (opts.regex !== undefined) _searchRegex = opts.regex;
  if (opts.caseSensitive !== undefined) _searchCaseSensitive = opts.caseSensitive;
  if (opts.scope !== undefined) _searchScope = opts.scope;
  if (opts.fuzzy !== undefined) _searchFuzzy = opts.fuzzy;
  _searchCurrentIndex = 0;
}

export function nextSearchResult(): void {
  if (_searchResults.length === 0) return;
  _searchCurrentIndex = (_searchCurrentIndex + 1) % _searchResults.length;
  navigateToSearchResult();
}

export function prevSearchResult(): void {
  if (_searchResults.length === 0) return;
  _searchCurrentIndex = (_searchCurrentIndex - 1 + _searchResults.length) % _searchResults.length;
  navigateToSearchResult();
}

export function clearSearch(): void {
  _searchQuery = '';
  _searchCurrentIndex = 0;
}

// ---- JSONPath Filter ----

export function setJsonPathFilter(query: string): void {
  _jsonPathQuery = query;
  if (!query) {
    _jsonPathFilteredJson = undefined;
    _jsonPathError = null;
    _jsonPathMatchCount = 0;
    return;
  }
  if (_rawJson === undefined) return;
  const result = filterByJsonPath(_rawJson, query);
  _jsonPathError = result.error;
  _jsonPathMatchCount = result.matchCount;
  if (result.data !== null && !result.error) {
    _jsonPathFilteredJson = result.data;
    _expandedPaths = new Set<string>(['$']);
  } else {
    _jsonPathFilteredJson = undefined;
  }
}

export function clearJsonPathFilter(): void {
  _jsonPathQuery = '';
  _jsonPathFilteredJson = undefined;
  _jsonPathError = null;
  _jsonPathMatchCount = 0;
  _expandedPaths = new Set<string>(['$']);
}

// ---- Modes ----

export function setFilterMode(mode: 'highlight' | 'filter'): void { _filterMode = mode; }
export function toggleFilterMode(): void { _filterMode = _filterMode === 'highlight' ? 'filter' : 'highlight'; }
export function setViewMode(mode: 'tree' | 'table' | 'diff'): void { _viewMode = mode; }

// ---- Diff ----

export function setComparisonJson(json: any): void {
  const parsed = typeof json === 'string'
    ? (() => { try { return JSON.parse(json); } catch { return undefined; } })()
    : json;
  _comparisonJson = parsed;
  if (parsed !== undefined) _viewMode = 'diff';
}

export function clearComparison(): void {
  _comparisonJson = undefined;
  _viewMode = 'tree';
}

// ---- Search History ----

export function addToSearchHistory(query: string): void {
  if (!query.trim()) return;
  const filtered = _searchHistory.filter(q => q !== query);
  _searchHistory = [query, ...filtered].slice(0, MAX_SEARCH_HISTORY);
  persistState();
}

export function clearSearchHistory(): void {
  _searchHistory = [];
  persistState();
}

// ---- Bookmarks ----

export function toggleBookmark(path: string): void {
  const idx = _bookmarks.indexOf(path);
  if (idx >= 0) {
    _bookmarks = [..._bookmarks.slice(0, idx), ..._bookmarks.slice(idx + 1)];
  } else {
    _bookmarks = [..._bookmarks, path];
  }
  persistState();
}

export function removeBookmark(path: string): void {
  _bookmarks = _bookmarks.filter(p => p !== path);
  persistState();
}

export function clearBookmarks(): void {
  _bookmarks = [];
  persistState();
}

export function isBookmarked(path: string): boolean {
  return _bookmarks.includes(path);
}

// ---- Persistence ----

function persistState(): void {
  const vscodeApi = (globalThis as any).vscode;
  if (!vscodeApi?.setState) return;
  vscodeApi.setState({ searchHistory: _searchHistory, bookmarks: _bookmarks });
}

export function restorePersistedState(): void {
  const vscodeApi = (globalThis as any).vscode;
  if (!vscodeApi?.getState) return;
  const state = vscodeApi.getState();
  if (state?.searchHistory) _searchHistory = state.searchHistory;
  if (state?.bookmarks) _bookmarks = state.bookmarks;
}

// ---- Internal Helpers ----

function navigateToSearchResult(): void {
  if (_searchResults.length === 0 || _searchCurrentIndex >= _searchResults.length) return;
  const match = _searchResults[_searchCurrentIndex];
  _selectedPath = match.path;
  const segments = pathToSegments(match.path);
  const next = new Set(_expandedPaths);
  for (const seg of segments) next.add(seg.path);
  _expandedPaths = next;
}

function collectExpandablePaths(value: any, path: string, paths: Set<string>): void {
  if (value === null || typeof value !== 'object') return;
  paths.add(path);
  if (Array.isArray(value)) {
    const limit = _arrayPageMap.get(path) ?? PAGE_SIZE;
    const count = Math.min(limit, value.length);
    for (let i = 0; i < count; i++) {
      collectExpandablePaths(value[i], `${path}[${i}]`, paths);
    }
  } else {
    for (const [key, val] of Object.entries(value)) {
      const childPath = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key)
        ? `${path}.${key}` : `${path}["${key.replace(/"/g, '\\"')}"]`;
      collectExpandablePaths(val, childPath, paths);
    }
  }
}

function collectExpandablePathsToDepth(value: any, path: string, depth: number, maxDepth: number, paths: Set<string>): void {
  if (value === null || typeof value !== 'object') return;
  if (depth > maxDepth) return;
  paths.add(path);
  if (Array.isArray(value)) {
    const limit = _arrayPageMap.get(path) ?? PAGE_SIZE;
    const count = Math.min(limit, value.length);
    for (let i = 0; i < count; i++) {
      collectExpandablePathsToDepth(value[i], `${path}[${i}]`, depth + 1, maxDepth, paths);
    }
  } else {
    for (const [key, val] of Object.entries(value)) {
      const childPath = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key)
        ? `${path}.${key}` : `${path}["${key.replace(/"/g, '\\"')}"]`;
      collectExpandablePathsToDepth(val, childPath, depth + 1, maxDepth, paths);
    }
  }
}

function pruneToMatches(json: any, matchPaths: Set<string>): any {
  const keepPaths = new Set<string>();
  for (const p of matchPaths) {
    keepPaths.add(p);
    const segs = pathToSegments(p);
    for (const seg of segs) keepPaths.add(seg.path);
  }
  return pruneNode(json, '$', keepPaths);
}

function pruneNode(value: any, path: string, keepPaths: Set<string>): any {
  if (!keepPaths.has(path)) return undefined;
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    const result: any[] = [];
    for (let i = 0; i < value.length; i++) {
      const childPath = `${path}[${i}]`;
      if (keepPaths.has(childPath)) {
        const pruned = pruneNode(value[i], childPath, keepPaths);
        if (pruned !== undefined) result.push(pruned);
      }
    }
    return result;
  }
  const result: Record<string, any> = {};
  for (const [key, val] of Object.entries(value)) {
    const childPath = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key)
      ? `${path}.${key}` : `${path}["${key.replace(/"/g, '\\"')}"]`;
    if (keepPaths.has(childPath)) {
      const pruned = pruneNode(val, childPath, keepPaths);
      if (pruned !== undefined) result[key] = pruned;
    }
  }
  return result;
}

function countNodes(value: any): number {
  if (value === null || typeof value !== 'object') return 1;
  let count = 1;
  if (Array.isArray(value)) {
    for (const item of value) count += countNodes(item);
  } else {
    for (const val of Object.values(value)) count += countNodes(val);
  }
  return count;
}
