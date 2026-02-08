import { getItemPath, resolveAuthForRequest, resolveHeadersForRequest, resolveRequestWithInheritance } from './InheritanceService';
import type { Collection, Folder, SavedRequest, AuthState, KeyValue } from './types';

function makeRequest(overrides: Partial<SavedRequest> = {}): SavedRequest {
  return {
    type: 'request',
    id: 'req-1',
    name: 'Test Request',
    method: 'GET',
    url: 'https://api.example.com',
    params: [],
    headers: [],
    auth: { type: 'none' },
    body: { type: 'none', content: '' },
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeFolder(overrides: Partial<Folder> = {}): Folder {
  return {
    type: 'folder',
    id: 'folder-1',
    name: 'Test Folder',
    children: [],
    expanded: true,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeCollection(overrides: Partial<Collection> = {}): Collection {
  return {
    id: 'col-1',
    name: 'Test Collection',
    items: [],
    expanded: true,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeHeader(key: string, value: string): KeyValue {
  return { id: `h-${key}`, key, value, enabled: true };
}

describe('InheritanceService', () => {
  describe('getItemPath', () => {
    it('should return path for root-level request', () => {
      const req = makeRequest();
      const col = makeCollection({ items: [req] });
      const path = getItemPath(col, 'req-1');
      expect(path).toHaveLength(1);
      expect(path[0]).toBe(col);
    });

    it('should return path through nested folders', () => {
      const req = makeRequest({ id: 'req-deep' });
      const innerFolder = makeFolder({ id: 'inner', name: 'Inner', children: [req] });
      const outerFolder = makeFolder({ id: 'outer', name: 'Outer', children: [innerFolder] });
      const col = makeCollection({ items: [outerFolder] });

      const path = getItemPath(col, 'req-deep');
      expect(path).toHaveLength(3);
      expect(path[0]).toBe(col);
      expect((path[1] as Folder).id).toBe('outer');
      expect((path[2] as Folder).id).toBe('inner');
    });
  });

  describe('resolveAuthForRequest', () => {
    it('should use own auth when authInheritance is undefined (backward compat)', () => {
      const reqAuth: AuthState = { type: 'bearer', token: 'my-token' };
      const req = makeRequest({ auth: reqAuth });
      const col = makeCollection({ items: [req], auth: { type: 'basic', username: 'u', password: 'p' } });

      const result = resolveAuthForRequest(col, [col], req);
      expect(result.auth).toEqual(reqAuth);
      expect(result.inheritedFrom).toBeUndefined();
    });

    it('should use own auth when authInheritance is "own"', () => {
      const reqAuth: AuthState = { type: 'bearer', token: 'my-token' };
      const req = makeRequest({ auth: reqAuth, authInheritance: 'own' });
      const col = makeCollection({ items: [req], auth: { type: 'basic', username: 'u', password: 'p' } });

      const result = resolveAuthForRequest(col, [col], req);
      expect(result.auth).toEqual(reqAuth);
    });

    it('should return no auth when authInheritance is "none"', () => {
      const req = makeRequest({ auth: { type: 'bearer', token: 't' }, authInheritance: 'none' });
      const col = makeCollection({ items: [req], auth: { type: 'basic', username: 'u', password: 'p' } });

      const result = resolveAuthForRequest(col, [col], req);
      expect(result.auth).toEqual({ type: 'none' });
    });

    it('should inherit auth from collection', () => {
      const colAuth: AuthState = { type: 'bearer', token: 'col-token' };
      const req = makeRequest({ authInheritance: 'inherit' });
      const col = makeCollection({ items: [req], auth: colAuth });

      const result = resolveAuthForRequest(col, [col], req);
      expect(result.auth).toEqual(colAuth);
      expect(result.inheritedFrom).toBe('Test Collection');
    });

    it('should inherit auth from parent folder', () => {
      const folderAuth: AuthState = { type: 'basic', username: 'admin', password: 'pass' };
      const req = makeRequest({ authInheritance: 'inherit' });
      const folder = makeFolder({ auth: folderAuth, children: [req] });
      const col = makeCollection({ items: [folder], auth: { type: 'bearer', token: 'col-token' } });

      const ancestors = [col, folder];
      const result = resolveAuthForRequest(col, ancestors, req);
      expect(result.auth).toEqual(folderAuth);
      expect(result.inheritedFrom).toBe('Test Folder');
    });

    it('should walk up chain when folder also inherits', () => {
      const colAuth: AuthState = { type: 'bearer', token: 'col-token' };
      const req = makeRequest({ authInheritance: 'inherit' });
      const folder = makeFolder({ authInheritance: 'inherit', children: [req] });
      const col = makeCollection({ items: [folder], auth: colAuth });

      const ancestors = [col, folder];
      const result = resolveAuthForRequest(col, ancestors, req);
      expect(result.auth).toEqual(colAuth);
      expect(result.inheritedFrom).toBe('Test Collection');
    });

    it('should stop at folder with "none" inheritance', () => {
      const colAuth: AuthState = { type: 'bearer', token: 'col-token' };
      const req = makeRequest({ authInheritance: 'inherit' });
      const folder = makeFolder({ authInheritance: 'none', children: [req] });
      const col = makeCollection({ items: [folder], auth: colAuth });

      const ancestors = [col, folder];
      const result = resolveAuthForRequest(col, ancestors, req);
      expect(result.auth).toEqual({ type: 'none' });
    });

    it('should fall back to no auth if chain has nothing', () => {
      const req = makeRequest({ authInheritance: 'inherit' });
      const col = makeCollection({ items: [req] });

      const result = resolveAuthForRequest(col, [col], req);
      expect(result.auth).toEqual({ type: 'none' });
    });
  });

  describe('resolveHeadersForRequest', () => {
    it('should return only request headers when no inherited headers', () => {
      const reqHeaders = [makeHeader('X-Custom', 'value')];
      const req = makeRequest({ headers: reqHeaders });
      const col = makeCollection({ items: [req] });

      const result = resolveHeadersForRequest(col, [col], req);
      expect(result).toHaveLength(1);
      expect(result[0].key).toBe('X-Custom');
    });

    it('should merge collection headers with request headers', () => {
      const colHeaders = [makeHeader('Authorization', 'Bearer col-token')];
      const reqHeaders = [makeHeader('X-Custom', 'value')];
      const req = makeRequest({ headers: reqHeaders });
      const col = makeCollection({ items: [req], headers: colHeaders });

      const result = resolveHeadersForRequest(col, [col], req);
      expect(result).toHaveLength(2);
      expect(result.find(h => h.key === 'Authorization')?.value).toBe('Bearer col-token');
      expect(result.find(h => h.key === 'X-Custom')?.value).toBe('value');
    });

    it('should let request headers override collection headers (case-insensitive)', () => {
      const colHeaders = [makeHeader('Content-Type', 'application/xml')];
      const reqHeaders = [makeHeader('content-type', 'application/json')];
      const req = makeRequest({ headers: reqHeaders });
      const col = makeCollection({ items: [req], headers: colHeaders });

      const result = resolveHeadersForRequest(col, [col], req);
      expect(result).toHaveLength(1);
      expect(result[0].value).toBe('application/json');
    });

    it('should merge through folder hierarchy', () => {
      const colHeaders = [makeHeader('X-Col', 'col')];
      const folderHeaders = [makeHeader('X-Folder', 'folder')];
      const reqHeaders = [makeHeader('X-Req', 'req')];
      const req = makeRequest({ headers: reqHeaders });
      const folder = makeFolder({ headers: folderHeaders, children: [req] });
      const col = makeCollection({ items: [folder], headers: colHeaders });

      const result = resolveHeadersForRequest(col, [col, folder], req);
      expect(result).toHaveLength(3);
      expect(result.find(h => h.key === 'X-Col')?.value).toBe('col');
      expect(result.find(h => h.key === 'X-Folder')?.value).toBe('folder');
      expect(result.find(h => h.key === 'X-Req')?.value).toBe('req');
    });

    it('should let folder override collection and request override folder', () => {
      const colHeaders = [makeHeader('X-Token', 'col-val')];
      const folderHeaders = [makeHeader('X-Token', 'folder-val')];
      const reqHeaders = [makeHeader('X-Token', 'req-val')];
      const req = makeRequest({ headers: reqHeaders });
      const folder = makeFolder({ headers: folderHeaders, children: [req] });
      const col = makeCollection({ items: [folder], headers: colHeaders });

      const result = resolveHeadersForRequest(col, [col, folder], req);
      expect(result).toHaveLength(1);
      expect(result[0].value).toBe('req-val');
    });
  });

  describe('resolveRequestWithInheritance', () => {
    it('should resolve auth and headers for a request by ID', () => {
      const colAuth: AuthState = { type: 'bearer', token: 'col-token' };
      const colHeaders = [makeHeader('X-Col', 'col')];
      const req = makeRequest({ id: 'req-target', authInheritance: 'inherit', headers: [makeHeader('X-Req', 'req')] });
      const col = makeCollection({ items: [req], auth: colAuth, headers: colHeaders });

      const result = resolveRequestWithInheritance(col, 'req-target');
      expect(result).not.toBeNull();
      expect(result!.auth).toEqual(colAuth);
      expect(result!.headers).toHaveLength(2);
      expect(result!.inheritedFrom).toBe('Test Collection');
    });

    it('should return null for non-existent request', () => {
      const col = makeCollection();
      const result = resolveRequestWithInheritance(col, 'non-existent');
      expect(result).toBeNull();
    });
  });
});
