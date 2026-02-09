import { GraphQLSchemaService } from './GraphQLSchemaService';
import * as HttpClient from './HttpClient';

jest.mock('./HttpClient');

const mockExecuteRequest = HttpClient.executeRequest as jest.MockedFunction<typeof HttpClient.executeRequest>;

function makeSchemaResponse(overrides?: Partial<any>): any {
  return {
    status: 200,
    statusText: 'OK',
    headers: { 'content-type': 'application/json' },
    httpVersion: '1.1',
    timing: { dnsLookup: 0, tcpConnection: 0, tlsHandshake: 0, ttfb: 10, contentTransfer: 5, total: 15 },
    timeline: [],
    data: {
      data: {
        __schema: {
          queryType: { name: 'Query' },
          mutationType: { name: 'Mutation' },
          subscriptionType: null,
          types: [
            {
              kind: 'OBJECT',
              name: 'Query',
              description: 'Root query type',
              fields: [
                {
                  name: 'users',
                  description: 'Get all users',
                  type: { kind: 'LIST', name: null, ofType: { kind: 'OBJECT', name: 'User', ofType: null } },
                  args: [],
                  isDeprecated: false,
                  deprecationReason: null,
                },
              ],
              interfaces: [],
              possibleTypes: null,
              enumValues: null,
              inputFields: null,
            },
            {
              kind: 'OBJECT',
              name: 'User',
              description: 'A user',
              fields: [
                {
                  name: 'id',
                  description: null,
                  type: { kind: 'NON_NULL', name: null, ofType: { kind: 'SCALAR', name: 'ID', ofType: null } },
                  args: [],
                  isDeprecated: false,
                  deprecationReason: null,
                },
                {
                  name: 'name',
                  description: null,
                  type: { kind: 'SCALAR', name: 'String', ofType: null },
                  args: [],
                  isDeprecated: false,
                  deprecationReason: null,
                },
              ],
              interfaces: [],
              possibleTypes: null,
              enumValues: null,
              inputFields: null,
            },
          ],
          ...overrides,
        },
      },
    },
  };
}

describe('GraphQLSchemaService', () => {
  let service: GraphQLSchemaService;

  const defaultHeaders = [{ id: '1', key: 'X-Custom', value: 'test', enabled: true }];
  const defaultAuth = { type: 'none' as const };
  const url = 'https://api.example.com/graphql';

  beforeEach(() => {
    service = new GraphQLSchemaService();
    mockExecuteRequest.mockReset();
  });

  describe('successful introspection', () => {
    it('should parse __schema from response', async () => {
      mockExecuteRequest.mockResolvedValue(makeSchemaResponse());

      const schema = await service.introspect(url, defaultHeaders, defaultAuth);

      expect(schema.queryType?.name).toBe('Query');
      expect(schema.mutationType?.name).toBe('Mutation');
      expect(schema.types).toHaveLength(2);
      expect(schema.types[0].name).toBe('Query');
      expect(schema.types[0].fields![0].name).toBe('users');
    });

    it('should send POST with introspection query', async () => {
      mockExecuteRequest.mockResolvedValue(makeSchemaResponse());

      await service.introspect(url, defaultHeaders, defaultAuth);

      expect(mockExecuteRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          url,
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'X-Custom': 'test',
          }),
        })
      );

      const callData = JSON.parse(mockExecuteRequest.mock.calls[0][0].data);
      expect(callData.query).toContain('IntrospectionQuery');
    });

    it('should handle string response data', async () => {
      const resp = makeSchemaResponse();
      resp.data = JSON.stringify(resp.data);
      mockExecuteRequest.mockResolvedValue(resp);

      const schema = await service.introspect(url, defaultHeaders, defaultAuth);
      expect(schema.queryType?.name).toBe('Query');
    });
  });

  describe('caching', () => {
    it('should return cached schema on second call', async () => {
      mockExecuteRequest.mockResolvedValue(makeSchemaResponse());

      const schema1 = await service.introspect(url, defaultHeaders, defaultAuth);
      const schema2 = await service.introspect(url, defaultHeaders, defaultAuth);

      expect(mockExecuteRequest).toHaveBeenCalledTimes(1);
      expect(schema1).toBe(schema2);
    });

    it('should clear cache with clearCache()', async () => {
      mockExecuteRequest.mockResolvedValue(makeSchemaResponse());

      await service.introspect(url, defaultHeaders, defaultAuth);
      service.clearCache();
      await service.introspect(url, defaultHeaders, defaultAuth);

      expect(mockExecuteRequest).toHaveBeenCalledTimes(2);
    });

    it('should use different cache entries for different URLs', async () => {
      mockExecuteRequest.mockResolvedValue(makeSchemaResponse());

      await service.introspect(url, defaultHeaders, defaultAuth);
      await service.introspect('https://other.example.com/graphql', defaultHeaders, defaultAuth);

      expect(mockExecuteRequest).toHaveBeenCalledTimes(2);
    });
  });

  describe('auth header forwarding', () => {
    it('should forward bearer token', async () => {
      mockExecuteRequest.mockResolvedValue(makeSchemaResponse());

      await service.introspect(url, [], { type: 'bearer', token: 'my-token' });

      expect(mockExecuteRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer my-token',
          }),
        })
      );
    });

    it('should forward basic auth', async () => {
      mockExecuteRequest.mockResolvedValue(makeSchemaResponse());

      await service.introspect(url, [], { type: 'basic', username: 'user', password: 'pass' });

      const expectedEncoded = Buffer.from('user:pass').toString('base64');
      expect(mockExecuteRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': `Basic ${expectedEncoded}`,
          }),
        })
      );
    });

    it('should forward API key in header', async () => {
      mockExecuteRequest.mockResolvedValue(makeSchemaResponse());

      await service.introspect(url, [], {
        type: 'apikey',
        apiKeyName: 'X-API-Key',
        apiKeyValue: 'secret123',
        apiKeyIn: 'header',
      });

      expect(mockExecuteRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-API-Key': 'secret123',
          }),
        })
      );
    });

    it('should not set auth header for none type', async () => {
      mockExecuteRequest.mockResolvedValue(makeSchemaResponse());

      await service.introspect(url, [], { type: 'none' });

      const headers = mockExecuteRequest.mock.calls[0][0].headers;
      expect(headers['Authorization']).toBeUndefined();
    });
  });

  describe('error handling', () => {
    it('should throw on network error', async () => {
      mockExecuteRequest.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(service.introspect(url, [], defaultAuth)).rejects.toThrow('ECONNREFUSED');
    });

    it('should throw on GraphQL errors array', async () => {
      const resp = makeSchemaResponse();
      resp.data = {
        errors: [{ message: 'Introspection is not allowed' }],
      };
      mockExecuteRequest.mockResolvedValue(resp);

      await expect(service.introspect(url, [], defaultAuth)).rejects.toThrow(
        'GraphQL errors: Introspection is not allowed'
      );
    });

    it('should throw on missing __schema', async () => {
      const resp = makeSchemaResponse();
      resp.data = { data: {} };
      mockExecuteRequest.mockResolvedValue(resp);

      await expect(service.introspect(url, [], defaultAuth)).rejects.toThrow(
        'Invalid introspection response: missing __schema'
      );
    });

    it('should throw on non-GraphQL response (invalid JSON string)', async () => {
      const resp = makeSchemaResponse();
      resp.data = '<html>Not Found</html>';
      mockExecuteRequest.mockResolvedValue(resp);

      await expect(service.introspect(url, [], defaultAuth)).rejects.toThrow();
    });

    it('should not cache failed introspections', async () => {
      mockExecuteRequest.mockRejectedValueOnce(new Error('Network error'));
      mockExecuteRequest.mockResolvedValueOnce(makeSchemaResponse());

      await expect(service.introspect(url, [], defaultAuth)).rejects.toThrow();
      const schema = await service.introspect(url, [], defaultAuth);

      expect(schema.queryType?.name).toBe('Query');
      expect(mockExecuteRequest).toHaveBeenCalledTimes(2);
    });
  });

  describe('custom headers', () => {
    it('should merge custom headers with content-type', async () => {
      mockExecuteRequest.mockResolvedValue(makeSchemaResponse());

      const customHeaders = [
        { id: '1', key: 'X-Request-ID', value: '12345', enabled: true },
        { id: '2', key: 'Accept', value: 'application/json', enabled: true },
        { id: '3', key: 'Disabled-Header', value: 'ignored', enabled: false },
      ];

      await service.introspect(url, customHeaders, defaultAuth);

      expect(mockExecuteRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'X-Request-ID': '12345',
            'Accept': 'application/json',
          }),
        })
      );

      const headers = mockExecuteRequest.mock.calls[0][0].headers;
      expect(headers['Disabled-Header']).toBeUndefined();
    });
  });
});
