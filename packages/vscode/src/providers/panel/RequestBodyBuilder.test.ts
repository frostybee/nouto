// Mock form-data module
const mockFormDataAppend = jest.fn();
const mockFormDataGetHeaders = jest.fn().mockReturnValue({ 'content-type': 'multipart/form-data; boundary=---mock' });

jest.mock('form-data', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    append: mockFormDataAppend,
    getHeaders: mockFormDataGetHeaders,
  })),
}));

import { RequestBodyBuilder, type BodyBuildResult } from './RequestBodyBuilder';

// --- Helpers ---

function createMockFileService(overrides: Partial<Record<'fileExists' | 'createReadStream' | 'readFileAsBuffer', any>> = {}): any {
  return {
    fileExists: jest.fn().mockReturnValue(true),
    createReadStream: jest.fn().mockReturnValue({ pipe: jest.fn() }),
    readFileAsBuffer: jest.fn().mockReturnValue(Buffer.from('file-contents')),
    ...overrides,
  };
}

function createBuilder(fileServiceOverrides: any = {}) {
  const fileService = createMockFileService(fileServiceOverrides);
  const builder = new RequestBodyBuilder(fileService);
  return { builder, fileService };
}

// --- Tests ---

describe('RequestBodyBuilder', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ==================== build() dispatch ====================

  describe('build() - dispatch and fallthrough', () => {
    it('returns empty headerUpdates when body has no content', async () => {
      const { builder } = createBuilder();
      const result = await builder.build({ type: 'json' }, {});

      expect(result).toEqual({ headerUpdates: {} });
      expect(result.data).toBeUndefined();
      expect(result.error).toBeUndefined();
    });

    it('returns data with no type-specific handling for unknown body type with content', async () => {
      const { builder } = createBuilder();
      const result = await builder.build({ type: 'unknown', content: 'raw stuff' }, {});

      expect(result).toEqual({ data: 'raw stuff', headerUpdates: {} });
    });

    it('returns empty headerUpdates when content is empty string (falsy)', async () => {
      const { builder } = createBuilder();
      const result = await builder.build({ type: 'json', content: '' }, {});

      expect(result).toEqual({ headerUpdates: {} });
    });
  });

  // ==================== JSON body ====================

  describe('build() - JSON body', () => {
    it('parses valid JSON and sets Content-Type', async () => {
      const { builder } = createBuilder();
      const result = await builder.build(
        { type: 'json', content: '{"key":"value"}' },
        {},
      );

      expect(result.data).toEqual({ key: 'value' });
      expect(result.headerUpdates['Content-Type']).toBe('application/json');
      expect(result.error).toBeUndefined();
    });

    it('does not override existing Content-Type for valid JSON', async () => {
      const { builder } = createBuilder();
      const result = await builder.build(
        { type: 'json', content: '{"a":1}' },
        { 'Content-Type': 'application/vnd.api+json' },
      );

      expect(result.data).toEqual({ a: 1 });
      expect(result.headerUpdates['Content-Type']).toBeUndefined();
    });

    it('falls back to text/plain for invalid JSON', async () => {
      const { builder } = createBuilder();
      const result = await builder.build(
        { type: 'json', content: '{invalid json' },
        {},
      );

      expect(result.data).toBe('{invalid json');
      expect(result.headerUpdates['Content-Type']).toBe('text/plain');
    });

    it('does not override existing Content-Type for invalid JSON', async () => {
      const { builder } = createBuilder();
      const result = await builder.build(
        { type: 'json', content: 'not json' },
        { 'Content-Type': 'text/html' },
      );

      expect(result.data).toBe('not json');
      expect(result.headerUpdates['Content-Type']).toBeUndefined();
    });

    it('parses JSON arrays correctly', async () => {
      const { builder } = createBuilder();
      const result = await builder.build(
        { type: 'json', content: '[1,2,3]' },
        {},
      );

      expect(result.data).toEqual([1, 2, 3]);
      expect(result.headerUpdates['Content-Type']).toBe('application/json');
    });
  });

  // ==================== Text body ====================

  describe('build() - text body', () => {
    it('returns content and sets Content-Type to text/plain', async () => {
      const { builder } = createBuilder();
      const result = await builder.build(
        { type: 'text', content: 'hello world' },
        {},
      );

      expect(result.data).toBe('hello world');
      expect(result.headerUpdates['Content-Type']).toBe('text/plain');
    });

    it('does not override existing Content-Type', async () => {
      const { builder } = createBuilder();
      const result = await builder.build(
        { type: 'text', content: 'hello' },
        { 'Content-Type': 'text/csv' },
      );

      expect(result.data).toBe('hello');
      expect(result.headerUpdates['Content-Type']).toBeUndefined();
    });
  });

  // ==================== XML body ====================

  describe('build() - XML body', () => {
    it('returns content and sets Content-Type to application/xml', async () => {
      const { builder } = createBuilder();
      const result = await builder.build(
        { type: 'xml', content: '<root><item>1</item></root>' },
        {},
      );

      expect(result.data).toBe('<root><item>1</item></root>');
      expect(result.headerUpdates['Content-Type']).toBe('application/xml');
    });

    it('does not override existing Content-Type', async () => {
      const { builder } = createBuilder();
      const result = await builder.build(
        { type: 'xml', content: '<x/>' },
        { 'Content-Type': 'text/xml' },
      );

      expect(result.data).toBe('<x/>');
      expect(result.headerUpdates['Content-Type']).toBeUndefined();
    });
  });

  // ==================== URL-encoded body ====================

  describe('build() - x-www-form-urlencoded body', () => {
    it('builds URL-encoded string from enabled items', async () => {
      const { builder } = createBuilder();
      const items = [
        { enabled: true, key: 'name', value: 'John' },
        { enabled: true, key: 'age', value: '30' },
        { enabled: false, key: 'disabled', value: 'skip' },
      ];
      const result = await builder.build(
        { type: 'x-www-form-urlencoded', content: JSON.stringify(items) },
        {},
      );

      expect(result.data).toBe('name=John&age=30');
      expect(result.headerUpdates['Content-Type']).toBe('application/x-www-form-urlencoded');
      expect(result.error).toBeUndefined();
    });

    it('skips items without a key', async () => {
      const { builder } = createBuilder();
      const items = [
        { enabled: true, key: '', value: 'no-key' },
        { enabled: true, key: 'valid', value: 'yes' },
      ];
      const result = await builder.build(
        { type: 'x-www-form-urlencoded', content: JSON.stringify(items) },
        {},
      );

      expect(result.data).toBe('valid=yes');
    });

    it('uses empty string for missing value', async () => {
      const { builder } = createBuilder();
      const items = [{ enabled: true, key: 'empty' }];
      const result = await builder.build(
        { type: 'x-www-form-urlencoded', content: JSON.stringify(items) },
        {},
      );

      expect(result.data).toBe('empty=');
    });

    it('does not override existing Content-Type', async () => {
      const { builder } = createBuilder();
      const items = [{ enabled: true, key: 'k', value: 'v' }];
      const result = await builder.build(
        { type: 'x-www-form-urlencoded', content: JSON.stringify(items) },
        { 'Content-Type': 'custom/type' },
      );

      expect(result.headerUpdates['Content-Type']).toBeUndefined();
    });

    it('returns validation error for invalid JSON content', async () => {
      const { builder } = createBuilder();
      const result = await builder.build(
        { type: 'x-www-form-urlencoded', content: 'not-json' },
        {},
      );

      expect(result.error).toBeDefined();
      expect(result.error!.category).toBe('validation');
      expect(result.error!.message).toBe('Invalid form data format');
      expect(result.data).toBeUndefined();
    });
  });

  // ==================== Form-data body ====================

  describe('build() - form-data body', () => {
    it('builds multipart form data with text fields', async () => {
      const { builder } = createBuilder();
      const items = [
        { enabled: true, key: 'name', value: 'Alice' },
        { enabled: false, key: 'skip', value: 'this' },
      ];
      const result = await builder.build(
        { type: 'form-data', content: JSON.stringify(items) },
        {},
      );

      expect(mockFormDataAppend).toHaveBeenCalledTimes(1);
      expect(mockFormDataAppend).toHaveBeenCalledWith('name', 'Alice');
      expect(result.headerUpdates['content-type']).toContain('multipart/form-data');
      expect(result.formData).toBeDefined();
      expect(result.error).toBeUndefined();
    });

    it('skips items without a key', async () => {
      const { builder } = createBuilder();
      const items = [
        { enabled: true, key: '', value: 'no-key' },
      ];
      await builder.build(
        { type: 'form-data', content: JSON.stringify(items) },
        {},
      );

      expect(mockFormDataAppend).not.toHaveBeenCalled();
    });

    it('uses empty string for missing text value', async () => {
      const { builder } = createBuilder();
      const items = [{ enabled: true, key: 'empty' }];
      await builder.build(
        { type: 'form-data', content: JSON.stringify(items) },
        {},
      );

      expect(mockFormDataAppend).toHaveBeenCalledWith('empty', '');
    });

    it('appends file fields using createReadStream when file exists', async () => {
      const mockStream = { pipe: jest.fn() };
      const { builder, fileService } = createBuilder({
        createReadStream: jest.fn().mockReturnValue(mockStream),
      });
      const items = [
        {
          enabled: true,
          key: 'upload',
          value: '/path/to/file.pdf',
          fieldType: 'file',
          fileName: 'doc.pdf',
          fileMimeType: 'application/pdf',
        },
      ];
      await builder.build(
        { type: 'form-data', content: JSON.stringify(items) },
        {},
      );

      expect(fileService.fileExists).toHaveBeenCalledWith('/path/to/file.pdf');
      expect(fileService.createReadStream).toHaveBeenCalledWith('/path/to/file.pdf');
      expect(mockFormDataAppend).toHaveBeenCalledWith('upload', mockStream, {
        filename: 'doc.pdf',
        contentType: 'application/pdf',
      });
    });

    it('skips file field when file does not exist', async () => {
      const { builder, fileService } = createBuilder({
        fileExists: jest.fn().mockReturnValue(false),
      });
      const items = [
        { enabled: true, key: 'upload', value: '/missing.txt', fieldType: 'file' },
      ];
      await builder.build(
        { type: 'form-data', content: JSON.stringify(items) },
        {},
      );

      expect(fileService.fileExists).toHaveBeenCalledWith('/missing.txt');
      expect(fileService.createReadStream).not.toHaveBeenCalled();
      expect(mockFormDataAppend).not.toHaveBeenCalled();
    });

    it('passes undefined for optional fileName and fileMimeType when not provided', async () => {
      const mockStream = { pipe: jest.fn() };
      const { builder } = createBuilder({
        createReadStream: jest.fn().mockReturnValue(mockStream),
      });
      const items = [
        { enabled: true, key: 'upload', value: '/path/file.bin', fieldType: 'file' },
      ];
      await builder.build(
        { type: 'form-data', content: JSON.stringify(items) },
        {},
      );

      expect(mockFormDataAppend).toHaveBeenCalledWith('upload', mockStream, {
        filename: undefined,
        contentType: undefined,
      });
    });

    it('treats file field with empty value as text field', async () => {
      const { builder } = createBuilder();
      const items = [
        { enabled: true, key: 'upload', value: '', fieldType: 'file' },
      ];
      await builder.build(
        { type: 'form-data', content: JSON.stringify(items) },
        {},
      );

      expect(mockFormDataAppend).toHaveBeenCalledWith('upload', '');
    });

    it('returns validation error for invalid JSON content', async () => {
      const { builder } = createBuilder();
      const result = await builder.build(
        { type: 'form-data', content: '{bad' },
        {},
      );

      expect(result.error).toBeDefined();
      expect(result.error!.category).toBe('validation');
      expect(result.error!.message).toBe('Invalid form data format');
      expect(result.data).toBeUndefined();
    });

    it('handles mix of text and file fields', async () => {
      const mockStream = { pipe: jest.fn() };
      const { builder } = createBuilder({
        createReadStream: jest.fn().mockReturnValue(mockStream),
      });
      const items = [
        { enabled: true, key: 'name', value: 'test' },
        { enabled: true, key: 'file', value: '/path.txt', fieldType: 'file', fileName: 'f.txt' },
      ];
      await builder.build(
        { type: 'form-data', content: JSON.stringify(items) },
        {},
      );

      expect(mockFormDataAppend).toHaveBeenCalledTimes(2);
      expect(mockFormDataAppend).toHaveBeenCalledWith('name', 'test');
      expect(mockFormDataAppend).toHaveBeenCalledWith('file', mockStream, {
        filename: 'f.txt',
        contentType: undefined,
      });
    });
  });

  // ==================== GraphQL body ====================

  describe('build() - GraphQL body', () => {
    it('builds GraphQL payload with query only', async () => {
      const { builder } = createBuilder();
      const result = await builder.build(
        { type: 'graphql', content: '{ users { id name } }' },
        {},
      );

      expect(result.data).toEqual({ query: '{ users { id name } }' });
      expect(result.headerUpdates['Content-Type']).toBe('application/json');
    });

    it('includes parsed variables when graphqlVariables is valid JSON', async () => {
      const { builder } = createBuilder();
      const result = await builder.build(
        {
          type: 'graphql',
          content: 'query($id: ID!) { user(id: $id) { name } }',
          graphqlVariables: '{"id":"123"}',
        },
        {},
      );

      expect(result.data).toEqual({
        query: 'query($id: ID!) { user(id: $id) { name } }',
        variables: { id: '123' },
      });
    });

    it('omits variables when graphqlVariables is invalid JSON', async () => {
      const { builder } = createBuilder();
      const result = await builder.build(
        {
          type: 'graphql',
          content: '{ users { id } }',
          graphqlVariables: '{bad json',
        },
        {},
      );

      expect(result.data).toEqual({ query: '{ users { id } }' });
      expect(result.data.variables).toBeUndefined();
    });

    it('omits variables when graphqlVariables is not provided', async () => {
      const { builder } = createBuilder();
      const result = await builder.build(
        { type: 'graphql', content: '{ q }' },
        {},
      );

      expect(result.data.variables).toBeUndefined();
    });

    it('includes operationName when provided', async () => {
      const { builder } = createBuilder();
      const result = await builder.build(
        {
          type: 'graphql',
          content: 'query GetUser { user { id } }',
          graphqlOperationName: 'GetUser',
        },
        {},
      );

      expect(result.data.operationName).toBe('GetUser');
    });

    it('omits operationName when not provided', async () => {
      const { builder } = createBuilder();
      const result = await builder.build(
        { type: 'graphql', content: '{ q }' },
        {},
      );

      expect(result.data.operationName).toBeUndefined();
    });

    it('does not override existing Content-Type', async () => {
      const { builder } = createBuilder();
      const result = await builder.build(
        { type: 'graphql', content: '{ q }' },
        { 'Content-Type': 'application/graphql+json' },
      );

      expect(result.headerUpdates['Content-Type']).toBeUndefined();
    });

    it('includes both variables and operationName together', async () => {
      const { builder } = createBuilder();
      const result = await builder.build(
        {
          type: 'graphql',
          content: 'mutation CreateUser($input: UserInput!) { createUser(input: $input) { id } }',
          graphqlVariables: '{"input":{"name":"Alice"}}',
          graphqlOperationName: 'CreateUser',
        },
        {},
      );

      expect(result.data).toEqual({
        query: 'mutation CreateUser($input: UserInput!) { createUser(input: $input) { id } }',
        variables: { input: { name: 'Alice' } },
        operationName: 'CreateUser',
      });
    });
  });

  // ==================== Binary body ====================

  describe('build() - binary body', () => {
    it('reads file as buffer and sets Content-Type from fileMimeType', async () => {
      const buf = Buffer.from('binary-data');
      const { builder, fileService } = createBuilder({
        readFileAsBuffer: jest.fn().mockReturnValue(buf),
      });
      const result = await builder.build(
        { type: 'binary', content: '/path/to/image.png', fileMimeType: 'image/png' },
        {},
      );

      expect(fileService.fileExists).toHaveBeenCalledWith('/path/to/image.png');
      expect(fileService.readFileAsBuffer).toHaveBeenCalledWith('/path/to/image.png');
      expect(result.data).toBe(buf);
      expect(result.headerUpdates['Content-Type']).toBe('image/png');
    });

    it('defaults to application/octet-stream when fileMimeType is not set', async () => {
      const { builder } = createBuilder();
      const result = await builder.build(
        { type: 'binary', content: '/path/to/data.bin' },
        {},
      );

      expect(result.headerUpdates['Content-Type']).toBe('application/octet-stream');
    });

    it('does not override existing Content-Type', async () => {
      const { builder } = createBuilder();
      const result = await builder.build(
        { type: 'binary', content: '/path/to/file', fileMimeType: 'image/png' },
        { 'Content-Type': 'application/custom' },
      );

      expect(result.headerUpdates['Content-Type']).toBeUndefined();
    });

    it('returns validation error when file does not exist', async () => {
      const { builder, fileService } = createBuilder({
        fileExists: jest.fn().mockReturnValue(false),
      });
      const result = await builder.build(
        { type: 'binary', content: '/missing/file.bin' },
        {},
      );

      expect(fileService.fileExists).toHaveBeenCalledWith('/missing/file.bin');
      expect(result.error).toBeDefined();
      expect(result.error!.category).toBe('validation');
      expect(result.error!.message).toBe('File not found');
      expect(result.data).toBeUndefined();
    });
  });
});
