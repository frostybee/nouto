import { HarExportService } from './HarExportService';
import type { SavedRequest, Folder } from '../types';

describe('HarExportService', () => {
  let service: HarExportService;

  beforeEach(() => {
    service = new HarExportService();
  });

  const makeRequest = (overrides: Partial<SavedRequest> = {}): SavedRequest => ({
    type: 'request',
    id: 'req-1',
    name: 'Test Request',
    method: 'GET',
    url: 'https://api.example.com/users',
    params: [],
    headers: [],
    auth: { type: 'none' },
    body: { type: 'none', content: '' },
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  });

  it('should export requests as valid HAR 1.2', () => {
    const result = JSON.parse(service.exportToHar([makeRequest()]));

    expect(result.log.version).toBe('1.2');
    expect(result.log.creator.name).toBe('HiveFetch');
    expect(result.log.entries).toHaveLength(1);
  });

  it('should export method and URL', () => {
    const result = JSON.parse(service.exportToHar([
      makeRequest({ method: 'POST', url: 'https://api.example.com/create' }),
    ]));

    const entry = result.log.entries[0];
    expect(entry.request.method).toBe('POST');
    expect(entry.request.url).toContain('api.example.com/create');
  });

  it('should export headers', () => {
    const result = JSON.parse(service.exportToHar([
      makeRequest({
        headers: [
          { id: 'h1', key: 'Content-Type', value: 'application/json', enabled: true },
          { id: 'h2', key: 'Disabled', value: 'skip', enabled: false },
        ],
      }),
    ]));

    const headers = result.log.entries[0].request.headers;
    expect(headers).toHaveLength(1);
    expect(headers[0].name).toBe('Content-Type');
  });

  it('should export query parameters', () => {
    const result = JSON.parse(service.exportToHar([
      makeRequest({
        params: [
          { id: 'p1', key: 'page', value: '1', enabled: true },
          { id: 'p2', key: 'disabled', value: 'no', enabled: false },
        ],
      }),
    ]));

    const qs = result.log.entries[0].request.queryString;
    expect(qs).toHaveLength(1);
    expect(qs[0].name).toBe('page');
  });

  it('should export JSON body as postData', () => {
    const result = JSON.parse(service.exportToHar([
      makeRequest({
        method: 'POST',
        body: { type: 'json', content: '{"name":"test"}' },
      }),
    ]));

    const postData = result.log.entries[0].request.postData;
    expect(postData.mimeType).toBe('application/json');
    expect(postData.text).toBe('{"name":"test"}');
  });

  it('should not include postData for empty body', () => {
    const result = JSON.parse(service.exportToHar([makeRequest()]));

    expect(result.log.entries[0].request.postData).toBeUndefined();
  });

  it('should flatten collection items including folders', () => {
    const folder: Folder = {
      type: 'folder',
      id: 'f1',
      name: 'Group',
      children: [makeRequest({ name: 'Nested' })],
      expanded: false,
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    };
    const result = JSON.parse(service.exportCollectionItems([
      makeRequest({ name: 'Root' }),
      folder,
    ]));

    expect(result.log.entries).toHaveLength(2);
  });

  it('should append query params to URL', () => {
    const result = JSON.parse(service.exportToHar([
      makeRequest({
        url: 'https://api.example.com/search',
        params: [{ id: 'p1', key: 'q', value: 'test', enabled: true }],
      }),
    ]));

    expect(result.log.entries[0].request.url).toContain('q=test');
  });
});
