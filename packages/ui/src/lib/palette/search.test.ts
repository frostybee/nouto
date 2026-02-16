import { describe, it, expect, beforeEach } from 'vitest';
import {
  fuzzySearch,
  initSearchEngine,
  onRequestSaved,
  onRequestDeleted,
  getAllRequests,
  parseFilter,
} from './search';
import type { Collection, SavedRequest } from '../../types';

// ─── Test Data ───

const createMockRequest = (overrides: Partial<SavedRequest>): SavedRequest => ({
  id: 'req-1',
  name: 'Get Users',
  method: 'GET',
  url: 'https://api.example.com/users',
  params: [],
  headers: [],
  auth: { type: 'none' },
  body: { type: 'none' },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

const createMockCollection = (id: string, items: any[]): Collection => ({
  id,
  name: `Collection ${id}`,
  items,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

// ─── Basic Search Tests ───

describe('Basic Search', () => {
  beforeEach(() => {
    const collections: Collection[] = [
      createMockCollection('col-1', [
        createMockRequest({ id: 'req-1', method: 'GET', name: 'Get Users', url: 'https://api.example.com/users' }),
        createMockRequest({ id: 'req-2', method: 'POST', name: 'Create User', url: 'https://api.example.com/users' }),
        createMockRequest({ id: 'req-3', method: 'PUT', name: 'Update User', url: 'https://api.example.com/users/123' }),
      ]),
    ];
    initSearchEngine(collections);
  });

  it('should find requests by name', () => {
    const results = fuzzySearch('Users');
    expect(results.length).toBeGreaterThan(0);
    const match = results.find(r => r.item.name === 'Get Users');
    expect(match).toBeDefined();
  });

  it('should find requests by URL', () => {
    const results = fuzzySearch('/users/123');
    expect(results.length).toBeGreaterThan(0);
    const match = results.find(r => r.item.url.includes('/users/123'));
    expect(match).toBeDefined();
  });

  it('should find requests by method', () => {
    const results = fuzzySearch('GET');
    expect(results.length).toBeGreaterThan(0);
    const match = results.find(r => r.item.method === 'GET');
    expect(match).toBeDefined();
  });

  it('should return empty array when no matches', () => {
    const results = fuzzySearch('NonExistentRequest');
    expect(results).toEqual([]);
  });

  it('should handle empty search query', () => {
    const results = fuzzySearch('');
    expect(results).toBeDefined();
    expect(Array.isArray(results)).toBe(true);
  });
});

// ─── Filter Parsing Tests ───

describe('Filter Parsing', () => {
  it('should parse method filter', () => {
    const filter = parseFilter('method:GET');
    expect(filter.type).toBe('method');
    expect(filter.value).toBe('GET');
  });

  it('should parse params filter', () => {
    const filter = parseFilter('params:userId');
    expect(filter.scope).toBe('params');
    expect(filter.term).toBe('userId');
  });

  it('should parse headers filter', () => {
    const filter = parseFilter('headers:Authorization');
    expect(filter.scope).toBe('headers');
    expect(filter.term).toBe('Authorization');
  });

  it('should parse body filter', () => {
    const filter = parseFilter('body:stripe');
    expect(filter.scope).toBe('body');
    expect(filter.term).toBe('stripe');
  });

  it('should parse deep filter', () => {
    const filter = parseFilter('deep:search');
    expect(filter.scope).toBe('all');
    expect(filter.term).toBe('search');
  });

  it('should handle plain text without filter', () => {
    const filter = parseFilter('plain search term');
    expect(filter.term).toBe('plain search term');
  });
});

// ─── Deep Search - Query Parameters ───

describe('Deep Search - Query Parameters', () => {
  beforeEach(() => {
    const collections: Collection[] = [
      createMockCollection('col-1', [
        createMockRequest({
          id: 'req-1',
          name: 'Search Users',
          url: 'https://api.example.com/users',
          params: [
            { key: 'userId', value: '123', enabled: true },
            { key: 'role', value: 'admin', enabled: true },
          ],
        }),
        createMockRequest({
          id: 'req-2',
          name: 'Get Profile',
          url: 'https://api.example.com/profile',
          params: [],
        }),
      ]),
    ];
    initSearchEngine(collections);
  });

  it('should find requests with query parameters', () => {
    const results = fuzzySearch('userId');
    expect(results.length).toBeGreaterThan(0);
    const match = results.find(r => r.item.id === 'req-1');
    expect(match).toBeDefined();
  });

  it('should not find requests without matching params', () => {
    const results = fuzzySearch('nonexistent');
    const match = results.find(r => r.item.id === 'req-2');
    // req-2 should either not be in results or have a low score
    expect(results.length === 0 || !match).toBe(true);
  });
});

// ─── Deep Search - Headers ───

describe('Deep Search - Headers', () => {
  beforeEach(() => {
    const collections: Collection[] = [
      createMockCollection('col-1', [
        createMockRequest({
          id: 'req-1',
          name: 'Authenticated Request',
          url: 'https://api.example.com/users',
          headers: [
            { key: 'Authorization', value: 'Bearer token123', enabled: true },
          ],
        }),
        createMockRequest({
          id: 'req-2',
          name: 'Public Request',
          url: 'https://api.example.com/public',
          headers: [],
        }),
      ]),
    ];
    initSearchEngine(collections);
  });

  it('should find requests with headers', () => {
    const results = fuzzySearch('Authorization');
    expect(results.length).toBeGreaterThan(0);
    const match = results.find(r => r.item.id === 'req-1');
    expect(match).toBeDefined();
  });

  it('should find requests with Bearer token', () => {
    const results = fuzzySearch('Bearer');
    expect(results.length).toBeGreaterThan(0);
    const match = results.find(r => r.item.id === 'req-1');
    expect(match).toBeDefined();
  });
});

// ─── Deep Search - Request Body ───

describe('Deep Search - Request Body', () => {
  beforeEach(() => {
    const collections: Collection[] = [
      createMockCollection('col-1', [
        createMockRequest({
          id: 'req-1',
          name: 'Create Payment',
          url: 'https://api.stripe.com/payments',
          body: {
            type: 'json',
            json: JSON.stringify({ amount: 1000, currency: 'usd', stripe_token: 'tok_123' }),
          },
        }),
        createMockRequest({
          id: 'req-2',
          name: 'GET Request',
          url: 'https://api.example.com/data',
          body: { type: 'none' },
        }),
      ]),
    ];
    initSearchEngine(collections);
  });

  it('should find requests with JSON body', () => {
    const results = fuzzySearch('stripe');
    expect(results.length).toBeGreaterThan(0);
    const match = results.find(r => r.item.id === 'req-1');
    expect(match).toBeDefined();
  });

  it('should find requests by body field name', () => {
    const results = fuzzySearch('amount');
    expect(results.length).toBeGreaterThan(0);
    const match = results.find(r => r.item.id === 'req-1');
    expect(match).toBeDefined();
  });
});

// ─── Deep Search - Variables ───

describe('Deep Search - Variables', () => {
  beforeEach(() => {
    const collections: Collection[] = [
      createMockCollection('col-1', [
        createMockRequest({
          id: 'req-1',
          name: 'User Request',
          url: 'https://{{baseUrl}}/users/{{userId}}',
        }),
        createMockRequest({
          id: 'req-2',
          name: 'Static Request',
          url: 'https://api.example.com/static',
        }),
      ]),
    ];
    initSearchEngine(collections);
  });

  it('should find requests with variables', () => {
    const results = fuzzySearch('baseUrl');
    expect(results.length).toBeGreaterThan(0);
    const match = results.find(r => r.item.id === 'req-1');
    expect(match).toBeDefined();
  });

  it('should find requests with userId variable', () => {
    const results = fuzzySearch('userId');
    expect(results.length).toBeGreaterThan(0);
    const match = results.find(r => r.item.id === 'req-1');
    expect(match).toBeDefined();
  });
});

// ─── Fuzzy Matching Quality ───

describe('Fuzzy Matching', () => {
  beforeEach(() => {
    const collections: Collection[] = [
      createMockCollection('col-1', [
        createMockRequest({ id: 'req-1', name: 'Get Users', url: 'https://api.example.com/users' }),
        createMockRequest({ id: 'req-2', name: 'Update User Settings', url: 'https://api.example.com/settings' }),
      ]),
    ];
    initSearchEngine(collections);
  });

  it('should match exact name', () => {
    const results = fuzzySearch('Get Users');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].item.name).toBe('Get Users');
  });

  it('should match partial name', () => {
    const results = fuzzySearch('User');
    expect(results.length).toBeGreaterThan(0);
  });

  it('should be case insensitive', () => {
    const results = fuzzySearch('get users');
    expect(results.length).toBeGreaterThan(0);
    const match = results.find(r => r.item.name === 'Get Users');
    expect(match).toBeDefined();
  });

  it('should match URL paths', () => {
    const results = fuzzySearch('/users');
    expect(results.length).toBeGreaterThan(0);
  });
});

// ─── CRUD Operations ───

describe('CRUD Operations', () => {
  beforeEach(() => {
    const collections: Collection[] = [
      createMockCollection('col-1', [
        createMockRequest({ id: 'req-1', name: 'Original Request', url: 'https://api.example.com/original' }),
      ]),
    ];
    initSearchEngine(collections);
  });

  it('should add new request to index via onRequestSaved', () => {
    const newRequest = createMockRequest({
      id: 'req-2',
      name: 'New Request',
      url: 'https://api.example.com/new',
    });

    onRequestSaved(newRequest, 'col-1', 'Collection col-1');

    const results = fuzzySearch('New Request');
    expect(results.length).toBeGreaterThan(0);
    const match = results.find(r => r.item.id === 'req-2');
    expect(match).toBeDefined();
  });

  it('should update existing request via onRequestSaved', () => {
    const updatedRequest = createMockRequest({
      id: 'req-1',
      name: 'Updated Request',
      url: 'https://api.example.com/updated',
    });

    onRequestSaved(updatedRequest, 'col-1', 'Collection col-1');

    // Should not find old name
    const oldResults = fuzzySearch('Original Request');
    expect(oldResults).toHaveLength(0);

    // Should find new name
    const newResults = fuzzySearch('Updated Request');
    expect(newResults.length).toBeGreaterThan(0);
  });

  it('should remove request from index via onRequestDeleted', () => {
    onRequestDeleted('req-1');

    const results = fuzzySearch('Original Request');
    expect(results).toHaveLength(0);
  });

  it('should handle multiple operations', () => {
    // Add new request
    onRequestSaved(createMockRequest({ id: 'req-2', name: 'Request 2' }), 'col-1', 'Collection col-1');

    // Update existing
    onRequestSaved(createMockRequest({ id: 'req-1', name: 'Updated' }), 'col-1', 'Collection col-1');

    // Delete
    onRequestDeleted('req-2');

    const allRequests = getAllRequests();
    expect(allRequests.length).toBe(1);
    expect(allRequests[0].name).toBe('Updated');
  });
});

// ─── Performance Tests ───

describe('Performance', () => {
  it('should search large dataset quickly', () => {
    // Generate 1000 mock requests
    const requests = Array.from({ length: 1000 }, (_, i) => ({
      type: 'request' as const,
      ...createMockRequest({
        id: `req-${i}`,
        name: `Request ${i}`,
        url: `https://api.example.com/endpoint${i}`,
        method: i % 2 === 0 ? 'GET' : 'POST',
      }),
    }));

    const collections: Collection[] = [
      createMockCollection('col-1', requests),
    ];

    initSearchEngine(collections);

    const startTime = performance.now();
    const results = fuzzySearch('Request 500');
    const endTime = performance.now();
    const duration = endTime - startTime;

    expect(results.length).toBeGreaterThan(0);
    expect(duration).toBeLessThan(100); // Relaxed to 100ms for CI environments
  });
});

// ─── Edge Cases ───

describe('Edge Cases', () => {
  it('should handle empty collections', () => {
    initSearchEngine([]);
    const results = fuzzySearch('anything');
    expect(results).toEqual([]);
  });

  it('should handle collections with no requests', () => {
    const collections: Collection[] = [
      createMockCollection('col-1', []),
    ];
    initSearchEngine(collections);
    const results = fuzzySearch('anything');
    expect(results).toEqual([]);
  });

  it('should handle special characters in search', () => {
    const collections: Collection[] = [
      createMockCollection('col-1', [
        createMockRequest({ id: 'req-1', name: 'Test (special)', url: 'https://api.example.com/test' }),
      ]),
    ];
    initSearchEngine(collections);
    const results = fuzzySearch('special');
    expect(results.length).toBeGreaterThan(0);
  });

  it('should handle nested folders', () => {
    const collections: Collection[] = [
      createMockCollection('col-1', [
        {
          type: 'folder',
          id: 'folder-1',
          name: 'API v1',
          children: [
            createMockRequest({ id: 'req-1', name: 'Get Users', url: 'https://api.example.com/v1/users' }),
          ],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ]),
    ];
    initSearchEngine(collections);
    const results = fuzzySearch('Users');
    expect(results.length).toBeGreaterThan(0);
  });

  it('should handle getAllRequests', () => {
    const collections: Collection[] = [
      createMockCollection('col-1', [
        createMockRequest({ id: 'req-1', name: 'Request 1' }),
        createMockRequest({ id: 'req-2', name: 'Request 2' }),
      ]),
    ];
    initSearchEngine(collections);

    const allRequests = getAllRequests();
    expect(allRequests).toHaveLength(2);
    expect(allRequests[0].id).toBe('req-1');
    expect(allRequests[1].id).toBe('req-2');
  });
});
