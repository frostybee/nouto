import { HarImportService } from './HarImportService';

describe('HarImportService', () => {
  let service: HarImportService;

  beforeEach(() => {
    service = new HarImportService();
  });

  const makeHar = (entries: any[]) => JSON.stringify({
    log: {
      version: '1.2',
      entries,
    },
  });

  const makeEntry = (overrides: any = {}) => ({
    request: {
      method: 'GET',
      url: 'https://api.example.com/users',
      headers: [],
      queryString: [],
      ...overrides,
    },
  });

  it('should import a basic HAR file', () => {
    const content = makeHar([makeEntry()]);
    const result = service.importFromString(content);

    expect(result.collection).toBeDefined();
    expect(result.collection.name).toContain('1 requests');
    expect(result.collection.items).toHaveLength(1);
  });

  it('should extract method and URL', () => {
    const content = makeHar([makeEntry({ method: 'POST', url: 'https://api.example.com/users' })]);
    const result = service.importFromString(content);

    const req = result.collection.items[0] as any;
    expect(req.method).toBe('POST');
    expect(req.url).toContain('api.example.com');
  });

  it('should extract query parameters', () => {
    const content = makeHar([makeEntry({
      queryString: [
        { name: 'page', value: '1' },
        { name: 'limit', value: '10' },
      ],
    })]);
    const result = service.importFromString(content);

    const req = result.collection.items[0] as any;
    expect(req.params).toHaveLength(2);
    expect(req.params[0].key).toBe('page');
    expect(req.params[1].key).toBe('limit');
  });

  it('should extract headers (skip pseudo-headers)', () => {
    const content = makeHar([makeEntry({
      headers: [
        { name: ':method', value: 'GET' },
        { name: 'Content-Type', value: 'application/json' },
        { name: 'Authorization', value: 'Bearer token123' },
      ],
    })]);
    const result = service.importFromString(content);

    const req = result.collection.items[0] as any;
    expect(req.headers).toHaveLength(2);
    expect(req.headers[0].key).toBe('Content-Type');
    expect(req.headers[1].key).toBe('Authorization');
  });

  it('should parse JSON body', () => {
    const content = makeHar([makeEntry({
      method: 'POST',
      postData: { mimeType: 'application/json', text: '{"name":"test"}' },
    })]);
    const result = service.importFromString(content);

    const req = result.collection.items[0] as any;
    expect(req.body.type).toBe('json');
    expect(req.body.content).toBe('{"name":"test"}');
  });

  it('should parse form-urlencoded body', () => {
    const content = makeHar([makeEntry({
      postData: { mimeType: 'application/x-www-form-urlencoded', text: 'key=value' },
    })]);
    const result = service.importFromString(content);

    const req = result.collection.items[0] as any;
    expect(req.body.type).toBe('x-www-form-urlencoded');
  });

  it('should group by domain into folders for multiple domains', () => {
    const content = makeHar([
      makeEntry({ url: 'https://api.example.com/a' }),
      makeEntry({ url: 'https://api.example.com/b' }),
      makeEntry({ url: 'https://other.example.com/c' }),
    ]);
    const result = service.importFromString(content);

    expect(result.collection.items).toHaveLength(2); // 2 folders
    expect((result.collection.items[0] as any).type).toBe('folder');
    expect((result.collection.items[0] as any).name).toBe('api.example.com');
    expect((result.collection.items[1] as any).name).toBe('other.example.com');
  });

  it('should not group into folders for single domain', () => {
    const content = makeHar([
      makeEntry({ url: 'https://api.example.com/a' }),
      makeEntry({ url: 'https://api.example.com/b' }),
    ]);
    const result = service.importFromString(content);

    expect(result.collection.items).toHaveLength(2);
    expect((result.collection.items[0] as any).type).toBe('request');
  });

  it('should throw on invalid HAR format', () => {
    expect(() => service.importFromString('{"log":{}}')).toThrow('missing log.entries');
    expect(() => service.importFromString('{"foo":"bar"}')).toThrow('missing log.entries');
  });

  it('should handle entry with no postData', () => {
    const content = makeHar([makeEntry()]);
    const result = service.importFromString(content);

    const req = result.collection.items[0] as any;
    expect(req.body.type).toBe('none');
  });

  it('should handle multipart form-data with params', () => {
    const content = makeHar([makeEntry({
      postData: {
        mimeType: 'multipart/form-data',
        text: '',
        params: [{ name: 'file', value: 'data' }],
      },
    })]);
    const result = service.importFromString(content);

    const req = result.collection.items[0] as any;
    expect(req.body.type).toBe('form-data');
  });
});
