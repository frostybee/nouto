import MiniSearch from 'minisearch';
import type { Collection, SavedRequest, Folder, CollectionItem, KeyValue, BodyState, HttpMethod } from '../../types';
import { isFolder, isRequest } from '../../types';
import { frecency } from '../../stores/frecency';

// ─── Types ───

export interface SearchableRequest {
  id: string;
  name: string;
  url: string;
  method: HttpMethod;
  collectionName: string;
  collectionId: string;

  // Deep search fields (flattened to strings for MiniSearch)
  paramsText: string;        // "userId=123 filter=active"
  headersText: string;       // "Authorization=Bearer {{token}}"
  bodyText: string;          // Flattened searchable body content
  bodyKeys: string;          // "customerId email provider" (space-separated)
  variablesText: string;     // "{{token}} {{userId}}" (space-separated)
}

export interface MatchContext {
  location: 'name' | 'url' | 'params' | 'headers' | 'body';
  snippet?: string;      // Highlighted snippet showing the match
  lineNumber?: number;   // For body matches
  key?: string;          // For param/header matches (e.g., "userId")
}

export interface SearchResult {
  item: SearchableRequest;
  score: number;
  matchContext: MatchContext | null;
  searchScore: number;
  frecencyScore: number;
}

export interface FilterConfig {
  scope: 'body' | 'params' | 'headers' | 'all' | null;
  term: string;
  type?: 'method' | 'status' | 'collection';
  value?: string;
}

// ─── MiniSearch Configuration ───

let miniSearch: MiniSearch<SearchableRequest> | null = null;
let documentStore: Map<string, SearchableRequest> = new Map();

const MINISEARCH_OPTIONS = {
  fields: [
    'name', 'url', 'method', 'collectionName',
    'paramsText', 'headersText', 'bodyText', 'bodyKeys', 'variablesText',
  ],
  storeFields: [
    'id', 'name', 'url', 'method', 'collectionName', 'collectionId',
  ],
  searchOptions: {
    fuzzy: 0.2,           // Allow ~20% typos
    prefix: true,         // Match prefixes (type "str" → matches "stripe")
    boost: {
      name: 2.0,
      url: 1.8,
      method: 1.5,
      paramsText: 1.2,
      headersText: 1.0,
      bodyText: 0.8,
      bodyKeys: 0.8,
      variablesText: 0.6,
      collectionName: 0.5,
    },
  },
};

// ─── Index Rebuild Strategy ───
// The index is rebuilt ONLY on persisted data changes:
//   - App startup (initial load)
//   - Request saved (create/update)
//   - Request deleted
//   - Collection/folder created/deleted/renamed
//   - Bulk import (OpenAPI, Postman, Insomnia, etc.)
//
// NOT rebuilt on: typing in URL bar, editing headers, changing body,
// toggling params - that's all transient editing state.

// ─── Helper Functions ───

/**
 * Extract searchable text from query parameters
 */
function extractParamsText(url: string, params: KeyValue[]): string {
  const enabledParams = params.filter(p => p.enabled);
  return enabledParams.map(p => `${p.key} ${p.value}`).join(' ');
}

/**
 * Extract searchable text from headers
 */
function extractHeadersText(headers: KeyValue[]): string {
  const enabledHeaders = headers.filter(h => h.enabled);
  return enabledHeaders.map(h => `${h.key} ${h.value}`).join(' ');
}

/**
 * Extract searchable text from request body
 */
function extractBodyText(body: BodyState): string {
  if (!body || body.type === 'none') return '';

  switch (body.type) {
    case 'json':
      try {
        const parsed = JSON.parse(body.content || '{}');
        return flattenObject(parsed).join(' ');
      } catch {
        return body.content || '';
      }

    case 'graphql':
      // GraphQL: extract operation names and query text
      const operationName = body.graphqlOperationName || '';
      const queryText = body.content || '';
      return `${operationName} ${queryText}`.trim();

    case 'form-data':
    case 'x-www-form-urlencoded':
      // Form data: extract field names and values
      try {
        const lines = (body.content || '').split('\n');
        return lines.map(line => {
          const [key, value] = line.split('=');
          return `${key || ''} ${value || ''}`;
        }).join(' ');
      } catch {
        return body.content || '';
      }

    case 'text':
    case 'binary':
      return body.content || '';

    default:
      return body.content || '';
  }
}

/**
 * Extract JSON keys from request body
 */
function extractBodyKeys(body: BodyState): string[] {
  if (!body || body.type !== 'json') return [];

  try {
    const parsed = JSON.parse(body.content || '{}');
    return extractKeys(parsed);
  } catch {
    return [];
  }
}

/**
 * Extract all keys from a nested object
 */
function extractKeys(obj: any, prefix = ''): string[] {
  if (typeof obj !== 'object' || obj === null) return [];

  const keys: string[] = [];

  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    keys.push(fullKey);

    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      keys.push(...extractKeys(value, fullKey));
    }
  }

  return keys;
}

/**
 * Flatten nested object values to array of strings
 */
function flattenObject(obj: any): string[] {
  if (typeof obj !== 'object' || obj === null) {
    return [String(obj)];
  }

  if (Array.isArray(obj)) {
    return obj.flatMap(item => flattenObject(item));
  }

  return Object.entries(obj).flatMap(([key, value]) => [
    key,
    ...flattenObject(value),
  ]);
}

/**
 * Extract variable references from request ({{variableName}})
 */
function extractVariables(request: SavedRequest): string[] {
  const variablePattern = /\{\{([^}]+)\}\}/g;
  const variables: Set<string> = new Set();

  // URL
  const urlMatches = request.url.matchAll(variablePattern);
  for (const match of urlMatches) {
    variables.add(`{{${match[1]}}}`);
  }

  // Headers
  for (const header of request.headers) {
    const headerMatches = header.value.matchAll(variablePattern);
    for (const match of headerMatches) {
      variables.add(`{{${match[1]}}}`);
    }
  }

  // Body
  if (request.body && request.body.content) {
    const bodyMatches = request.body.content.matchAll(variablePattern);
    for (const match of bodyMatches) {
      variables.add(`{{${match[1]}}}`);
    }
  }

  return Array.from(variables);
}

/**
 * Traverse collection items recursively
 */
function traverseCollectionItems(
  items: CollectionItem[],
  callback: (request: SavedRequest) => void
): void {
  for (const item of items) {
    if (isRequest(item)) {
      callback(item);
    } else if (isFolder(item)) {
      traverseCollectionItems(item.children, callback);
    }
  }
}

/**
 * Convert a SavedRequest to a SearchableRequest document
 */
export function toSearchableRequest(
  request: SavedRequest,
  collectionName: string,
  collectionId: string
): SearchableRequest {
  return {
    id: request.id,
    name: request.name,
    url: request.url,
    method: request.method,
    collectionName,
    collectionId,
    paramsText: extractParamsText(request.url, request.params),
    headersText: extractHeadersText(request.headers),
    bodyText: extractBodyText(request.body),
    bodyKeys: extractBodyKeys(request.body).join(' '),
    variablesText: extractVariables(request).join(' '),
  };
}

/**
 * Build flat document array from nested collections
 */
function buildSearchDocuments(collections: Collection[]): SearchableRequest[] {
  const docs: SearchableRequest[] = [];

  for (const collection of collections) {
    // Skip built-in collections like "recent"
    if (collection.builtin) continue;

    traverseCollectionItems(collection.items, (request) => {
      docs.push(toSearchableRequest(request, collection.name, collection.id));
    });
  }

  return docs;
}

// ─── Search Engine Initialization ───

/**
 * Create or rebuild the search engine from collections
 */
export function initSearchEngine(collections: Collection[]): MiniSearch<SearchableRequest> {
  const documents = buildSearchDocuments(collections);

  documentStore = new Map();
  for (const doc of documents) {
    documentStore.set(doc.id, doc);
  }

  miniSearch = new MiniSearch<SearchableRequest>(MINISEARCH_OPTIONS);
  miniSearch.addAll(documents);

  return miniSearch;
}

/**
 * Get the current search engine instance
 */
export function getSearchEngine(): MiniSearch<SearchableRequest> | null {
  return miniSearch;
}

// ─── Granular CRUD Updates (no full rebuild needed) ───

/**
 * Update search index when a request is saved (create or update)
 */
export function onRequestSaved(
  request: SavedRequest,
  collectionName: string,
  collectionId: string
): void {
  if (!miniSearch) return;

  const doc = toSearchableRequest(request, collectionName, collectionId);

  // Update document store and index
  const oldDoc = documentStore.get(doc.id);
  documentStore.set(doc.id, doc);

  if (oldDoc) {
    // Remove old document using full field data (not just storeFields)
    miniSearch.remove(oldDoc);
  }
  miniSearch.add(doc);
}

/**
 * Remove request from search index when deleted
 */
export function onRequestDeleted(requestId: string): void {
  if (!miniSearch) return;

  const doc = documentStore.get(requestId);
  documentStore.delete(requestId);

  if (doc) {
    try {
      miniSearch.remove(doc);
    } catch {
      // Document might not exist in index, ignore error
    }
  }
}

/**
 * Update collection name in search index
 */
export function onCollectionRenamed(
  collectionId: string,
  newName: string,
  collections: Collection[]
): void {
  if (!miniSearch) return;

  // Find all requests in this collection and update them
  const collection = collections.find(c => c.id === collectionId);
  if (!collection) return;

  traverseCollectionItems(collection.items, (request) => {
    onRequestSaved(request, newName, collectionId);
  });
}

// ─── Filter Parsing ───

/**
 * Parse filter syntax from search query
 *
 * Examples:
 * - "m:GET" → { type: 'method', value: 'GET', term: '' }
 * - "b:stripe" → { scope: 'body', term: 'stripe' }
 * - "p:userId" → { scope: 'params', term: 'userId' }
 * - "h:auth" → { scope: 'headers', term: 'auth' }
 * - "d:token" → { scope: 'all', term: 'token' }
 * - "GET" → { type: 'method', value: 'GET', term: '' } (implicit)
 */
export function parseFilter(query: string): FilterConfig {
  // Implicit HTTP method detection (bare GET, POST, etc.)
  const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
  const trimmed = query.trim().toUpperCase();
  if (HTTP_METHODS.includes(trimmed)) {
    return { scope: null, term: '', type: 'method', value: trimmed };
  }

  const filterPattern = /^(\w+):(.*)$/;
  const match = query.match(filterPattern);

  if (!match) {
    return { scope: null, term: query };
  }

  const KNOWN_FILTERS = ['m', 's', 'c', 'b', 'p', 'h', 'd'];
  if (!KNOWN_FILTERS.includes(match[1])) {
    return { scope: null, term: query };
  }

  const [, filterType, filterValue] = match;

  if (filterType === 'm') {
    return { scope: null, term: '', type: 'method', value: filterValue.toUpperCase() };
  }

  if (filterType === 's') {
    return { scope: null, term: '', type: 'status', value: filterValue };
  }

  if (filterType === 'c') {
    return { scope: null, term: '', type: 'collection', value: filterValue };
  }

  if (filterType === 'b') {
    return { scope: 'body', term: filterValue };
  }

  if (filterType === 'p') {
    return { scope: 'params', term: filterValue };
  }

  if (filterType === 'h') {
    return { scope: 'headers', term: filterValue };
  }

  if (filterType === 'd') {
    return { scope: 'all', term: filterValue };
  }

  return { scope: null, term: query };
}

// ─── Match Context Extraction ───

/**
 * Map MiniSearch field names to display location types
 */
function mapFieldToLocation(key?: string): MatchContext['location'] {
  if (!key) return 'name';
  if (key === 'bodyText' || key === 'bodyKeys') return 'body';
  if (key === 'paramsText') return 'params';
  if (key === 'headersText') return 'headers';
  if (key === 'url') return 'url';
  return 'name';
}

/**
 * Extract match context from MiniSearch match info
 * MiniSearch provides: result.match = { fieldName: [matchedTerms] }
 */
export function extractMatchContext(
  match: Record<string, string[]> | undefined,
  terms: string[]
): MatchContext | null {
  if (!match || Object.keys(match).length === 0) return null;

  // Priority order: body > params > headers > url > name
  const fieldPriority = ['bodyText', 'bodyKeys', 'paramsText', 'headersText', 'url', 'name'];

  for (const field of fieldPriority) {
    if (match[field] && match[field].length > 0) {
      return {
        location: mapFieldToLocation(field),
        snippet: `matched: ${match[field].join(', ')}`,
        key: field,
      };
    }
  }

  // Fallback: first matched field
  const firstField = Object.keys(match)[0];
  return {
    location: mapFieldToLocation(firstField),
    snippet: `matched: ${match[firstField].join(', ')}`,
    key: firstField,
  };
}

// ─── Frecency Integration ───

/**
 * Get frecency score for a request (0-1, higher = more relevant)
 */
function getFrecencyScore(requestId: string): number {
  return frecency.getScore(requestId);
}

// ─── Main Search Function ───

/**
 * Perform fuzzy search with deep search support and frecency ranking
 */
export function fuzzySearch(query: string): SearchResult[] {
  if (!miniSearch) return [];

  // Parse filter syntax (body:, params:, headers:, etc.)
  const filter = parseFilter(query);
  const searchTerm = filter.term;

  // Handle type-only filters (method:GET, collection:Auth) - no search term needed
  if (filter.type && !searchTerm) {
    const allDocs = Array.from(documentStore.values());
    let filtered: SearchableRequest[];

    if (filter.type === 'method') {
      filtered = filter.value
        ? allDocs.filter(d => d.method === filter.value)
        : allDocs;
    } else if (filter.type === 'collection') {
      const lowerValue = (filter.value || '').toLowerCase();
      filtered = allDocs.filter(d => d.collectionName.toLowerCase().includes(lowerValue));
    } else {
      filtered = allDocs;
    }

    return filtered.map(item => ({
      item,
      score: getFrecencyScore(item.id),
      matchContext: null,
      searchScore: 1,
      frecencyScore: getFrecencyScore(item.id),
    }));
  }

  // Skip search for very short queries
  if (searchTerm.length < 2) return [];

  // Build search options based on filter scope
  const searchOptions = { ...MINISEARCH_OPTIONS.searchOptions };

  const defaultBoost = { name: 0, url: 0, method: 0, collectionName: 0, paramsText: 0, headersText: 0, bodyText: 0, bodyKeys: 0, variablesText: 0 };
  if (filter.scope === 'body') {
    searchOptions.boost = { ...defaultBoost, bodyText: 2.0, bodyKeys: 1.5 };
  } else if (filter.scope === 'params') {
    searchOptions.boost = { ...defaultBoost, paramsText: 2.0 };
  } else if (filter.scope === 'headers') {
    searchOptions.boost = { ...defaultBoost, headersText: 2.0 };
  }

  // Perform search via MiniSearch
  const msResults = miniSearch.search(searchTerm, searchOptions);

  // Transform results and combine with frecency scoring
  const results = msResults.map(result => {
    const id = result.id as string;
    const frecencyScore = getFrecencyScore(id);

    // Look up full document from store (MiniSearch only returns storeFields)
    const item = documentStore.get(id) || (result as any as SearchableRequest);

    // MiniSearch provides: result.match (which fields matched + terms)
    const matchContext = extractMatchContext(result.match, result.terms);

    // MiniSearch score is already higher = better (no inversion needed)
    const msScore = result.score;
    const maxScore = msResults[0]?.score || 1;
    const normalizedScore = msScore / maxScore; // Normalize to 0-1
    const finalScore = normalizedScore * 0.7 + frecencyScore * 0.3;

    return {
      item,
      score: finalScore,
      matchContext,
      searchScore: normalizedScore,
      frecencyScore,
    };
  });

  // Apply method filter if specified
  const filteredResults = filter.type === 'method'
    ? results.filter(r => r.item.method === filter.value)
    : results;

  // Sort by final score and limit results
  return filteredResults
    .sort((a, b) => b.score - a.score)
    .slice(0, 100);
}

/**
 * Get all requests (no filtering) - useful for RECENT section
 */
export function getAllRequests(): SearchableRequest[] {
  return Array.from(documentStore.values());
}
