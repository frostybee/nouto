import { evaluateAssertions } from './AssertionEngine';
import type { Assertion, AssertionResult } from '../types';

function makeAssertion(overrides: Partial<Assertion>): Assertion {
  return {
    id: 'test-1',
    enabled: true,
    target: 'status',
    operator: 'equals',
    expected: '200',
    ...overrides,
  };
}

const jsonResponse = {
  status: 200,
  statusText: 'OK',
  headers: { 'content-type': 'application/json; charset=utf-8', 'x-request-id': 'abc-123' },
  data: { users: [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }], total: 2 },
  duration: 150,
};

const textResponse = {
  status: 404,
  statusText: 'Not Found',
  headers: { 'content-type': 'text/plain' },
  data: 'Not found',
  duration: 50,
};

const grpcResponse = {
  status: 0,
  statusText: 'OK',
  headers: { 'content-type': 'application/grpc', 'x-request-id': 'grpc-123' },
  data: { message: 'Hello World', count: 42 },
  duration: 45,
  grpcStatusMessage: 'OK',
  trailers: { 'grpc-status': '0', 'x-trace-id': 'trace-abc' },
  streamMessages: [
    { content: '{"message":"msg1","seq":1}', size: 25 },
    { content: '{"message":"msg2","seq":2}', size: 25 },
    { content: '{"message":"msg3","seq":3}', size: 25 },
  ],
};

const grpcErrorResponse = {
  status: 5,
  statusText: 'NOT_FOUND',
  headers: {},
  data: undefined,
  duration: 12,
  grpcStatusMessage: 'NOT_FOUND',
  trailers: { 'grpc-status': '5', 'grpc-message': 'Resource not found' },
  streamMessages: [],
};

describe('AssertionEngine', () => {
  describe('status target', () => {
    it('should pass when status equals expected', () => {
      const { results } = evaluateAssertions(
        [makeAssertion({ target: 'status', operator: 'equals', expected: '200' })],
        jsonResponse
      );
      expect(results[0].passed).toBe(true);
    });

    it('should fail when status does not equal expected', () => {
      const { results } = evaluateAssertions(
        [makeAssertion({ target: 'status', operator: 'equals', expected: '201' })],
        jsonResponse
      );
      expect(results[0].passed).toBe(false);
    });

    it('should handle notEquals', () => {
      const { results } = evaluateAssertions(
        [makeAssertion({ target: 'status', operator: 'notEquals', expected: '404' })],
        jsonResponse
      );
      expect(results[0].passed).toBe(true);
    });

    it('should handle greaterThan', () => {
      const { results } = evaluateAssertions(
        [makeAssertion({ target: 'status', operator: 'greaterThan', expected: '199' })],
        jsonResponse
      );
      expect(results[0].passed).toBe(true);
    });

    it('should handle lessThan', () => {
      const { results } = evaluateAssertions(
        [makeAssertion({ target: 'status', operator: 'lessThan', expected: '300' })],
        jsonResponse
      );
      expect(results[0].passed).toBe(true);
    });

    it('should handle greaterThanOrEqual', () => {
      const { results } = evaluateAssertions(
        [makeAssertion({ target: 'status', operator: 'greaterThanOrEqual', expected: '200' })],
        jsonResponse
      );
      expect(results[0].passed).toBe(true);
    });

    it('should handle lessThanOrEqual', () => {
      const { results } = evaluateAssertions(
        [makeAssertion({ target: 'status', operator: 'lessThanOrEqual', expected: '200' })],
        jsonResponse
      );
      expect(results[0].passed).toBe(true);
    });
  });

  describe('responseTime target', () => {
    it('should check response time less than', () => {
      const { results } = evaluateAssertions(
        [makeAssertion({ target: 'responseTime', operator: 'lessThan', expected: '500' })],
        jsonResponse
      );
      expect(results[0].passed).toBe(true);
    });

    it('should fail when response time exceeds expected', () => {
      const { results } = evaluateAssertions(
        [makeAssertion({ target: 'responseTime', operator: 'lessThan', expected: '100' })],
        jsonResponse
      );
      expect(results[0].passed).toBe(false);
    });
  });

  describe('body target', () => {
    it('should check body contains text', () => {
      const { results } = evaluateAssertions(
        [makeAssertion({ target: 'body', operator: 'contains', expected: 'Alice' })],
        jsonResponse
      );
      expect(results[0].passed).toBe(true);
    });

    it('should check body notContains', () => {
      const { results } = evaluateAssertions(
        [makeAssertion({ target: 'body', operator: 'notContains', expected: 'Charlie' })],
        jsonResponse
      );
      expect(results[0].passed).toBe(true);
    });

    it('should check body isJson for JSON response', () => {
      const { results } = evaluateAssertions(
        [makeAssertion({ target: 'body', operator: 'isJson' })],
        jsonResponse
      );
      expect(results[0].passed).toBe(true);
    });

    it('should fail isJson for text response', () => {
      const { results } = evaluateAssertions(
        [makeAssertion({ target: 'body', operator: 'isJson' })],
        textResponse
      );
      expect(results[0].passed).toBe(false);
    });

    it('should handle exists operator', () => {
      const { results } = evaluateAssertions(
        [makeAssertion({ target: 'body', operator: 'exists' })],
        jsonResponse
      );
      expect(results[0].passed).toBe(true);
    });

    it('should handle null body with exists', () => {
      const { results } = evaluateAssertions(
        [makeAssertion({ target: 'body', operator: 'exists' })],
        { ...jsonResponse, data: null }
      );
      expect(results[0].passed).toBe(false);
    });

    it('should check matches with regex', () => {
      const { results } = evaluateAssertions(
        [makeAssertion({ target: 'body', operator: 'matches', expected: 'Alice|Bob' })],
        jsonResponse
      );
      expect(results[0].passed).toBe(true);
    });
  });

  describe('jsonQuery target', () => {
    it('should extract value with JSONPath and check equals', () => {
      const { results } = evaluateAssertions(
        [makeAssertion({ target: 'jsonQuery', property: '$.total', operator: 'equals', expected: '2' })],
        jsonResponse
      );
      expect(results[0].passed).toBe(true);
    });

    it('should extract nested value', () => {
      const { results } = evaluateAssertions(
        [makeAssertion({ target: 'jsonQuery', property: '$.users[0].name', operator: 'equals', expected: 'Alice' })],
        jsonResponse
      );
      expect(results[0].passed).toBe(true);
    });

    it('should check count of array', () => {
      const { results } = evaluateAssertions(
        [makeAssertion({ target: 'jsonQuery', property: '$.users', operator: 'count', expected: '2' })],
        jsonResponse
      );
      expect(results[0].passed).toBe(true);
    });

    it('should handle missing path with notExists', () => {
      const { results } = evaluateAssertions(
        [makeAssertion({ target: 'jsonQuery', property: '$.missing', operator: 'notExists' })],
        jsonResponse
      );
      expect(results[0].passed).toBe(true);
    });

    it('should handle invalid JSONPath gracefully', () => {
      const { results } = evaluateAssertions(
        [makeAssertion({ target: 'jsonQuery', property: '', operator: 'exists' })],
        jsonResponse
      );
      // Empty path should return undefined
      expect(results[0].passed).toBe(false);
    });
  });

  describe('header target', () => {
    it('should find header case-insensitively', () => {
      const { results } = evaluateAssertions(
        [makeAssertion({ target: 'header', property: 'X-Request-Id', operator: 'equals', expected: 'abc-123' })],
        jsonResponse
      );
      expect(results[0].passed).toBe(true);
    });

    it('should handle missing header with notExists', () => {
      const { results } = evaluateAssertions(
        [makeAssertion({ target: 'header', property: 'X-Missing', operator: 'notExists' })],
        jsonResponse
      );
      expect(results[0].passed).toBe(true);
    });

    it('should check header contains', () => {
      const { results } = evaluateAssertions(
        [makeAssertion({ target: 'header', property: 'content-type', operator: 'contains', expected: 'application/json' })],
        jsonResponse
      );
      expect(results[0].passed).toBe(true);
    });
  });

  describe('contentType target', () => {
    it('should check content type contains', () => {
      const { results } = evaluateAssertions(
        [makeAssertion({ target: 'contentType', operator: 'contains', expected: 'json' })],
        jsonResponse
      );
      expect(results[0].passed).toBe(true);
    });

    it('should check content type equals', () => {
      const { results } = evaluateAssertions(
        [makeAssertion({ target: 'contentType', operator: 'equals', expected: 'text/plain' })],
        textResponse
      );
      expect(results[0].passed).toBe(true);
    });
  });

  describe('setVariable target', () => {
    it('should extract value and set variable', () => {
      const { results, variablesToSet } = evaluateAssertions(
        [makeAssertion({
          target: 'setVariable',
          property: '$.users[0].name',
          variableName: 'firstName',
        })],
        jsonResponse
      );
      expect(results[0].passed).toBe(true);
      expect(variablesToSet).toHaveLength(1);
      expect(variablesToSet[0]).toEqual({ key: 'firstName', value: 'Alice' });
    });

    it('should fail when path not found', () => {
      const { results, variablesToSet } = evaluateAssertions(
        [makeAssertion({
          target: 'setVariable',
          property: '$.missing.path',
          variableName: 'myVar',
        })],
        jsonResponse
      );
      expect(results[0].passed).toBe(false);
      expect(variablesToSet).toHaveLength(0);
    });

    it('should fail when variable name missing', () => {
      const { results } = evaluateAssertions(
        [makeAssertion({
          target: 'setVariable',
          property: '$.total',
        })],
        jsonResponse
      );
      expect(results[0].passed).toBe(false);
    });
  });

  describe('isType operator', () => {
    it('should detect number type', () => {
      const { results } = evaluateAssertions(
        [makeAssertion({ target: 'jsonQuery', property: '$.total', operator: 'isType', expected: 'number' })],
        jsonResponse
      );
      expect(results[0].passed).toBe(true);
    });

    it('should detect string type', () => {
      const { results } = evaluateAssertions(
        [makeAssertion({ target: 'jsonQuery', property: '$.users[0].name', operator: 'isType', expected: 'string' })],
        jsonResponse
      );
      expect(results[0].passed).toBe(true);
    });

    it('should detect array type', () => {
      const { results } = evaluateAssertions(
        [makeAssertion({ target: 'jsonQuery', property: '$.users', operator: 'isType', expected: 'array' })],
        jsonResponse
      );
      expect(results[0].passed).toBe(true);
    });
  });

  describe('disabled assertions', () => {
    it('should skip disabled assertions', () => {
      const { results } = evaluateAssertions(
        [makeAssertion({ enabled: false })],
        jsonResponse
      );
      expect(results).toHaveLength(0);
    });
  });

  describe('multiple assertions', () => {
    it('should evaluate all enabled assertions', () => {
      const { results } = evaluateAssertions(
        [
          makeAssertion({ id: 'a1', target: 'status', operator: 'equals', expected: '200' }),
          makeAssertion({ id: 'a2', target: 'responseTime', operator: 'lessThan', expected: '500' }),
          makeAssertion({ id: 'a3', enabled: false }),
          makeAssertion({ id: 'a4', target: 'contentType', operator: 'contains', expected: 'json' }),
        ],
        jsonResponse
      );
      expect(results).toHaveLength(3);
      expect(results.every(r => r.passed)).toBe(true);
    });
  });

  describe('schema target', () => {
    const validSchema = JSON.stringify({
      type: 'object',
      properties: {
        users: { type: 'array' },
        total: { type: 'number' },
      },
      required: ['users', 'total'],
    });

    it('should pass when response body matches the schema', () => {
      const { results } = evaluateAssertions(
        [makeAssertion({ target: 'schema', operator: 'equals', expected: validSchema })],
        jsonResponse
      );
      expect(results[0].passed).toBe(true);
    });

    it('should fail when response body does not match the schema', () => {
      const strictSchema = JSON.stringify({
        type: 'object',
        properties: { foo: { type: 'string' } },
        required: ['foo'],
      });
      const { results } = evaluateAssertions(
        [makeAssertion({ target: 'schema', operator: 'equals', expected: strictSchema })],
        jsonResponse
      );
      expect(results[0].passed).toBe(false);
      expect(results[0].message).toContain('Schema validation failed');
    });

    it('should fail when schema is empty', () => {
      const { results } = evaluateAssertions(
        [makeAssertion({ target: 'schema', operator: 'equals', expected: '' })],
        jsonResponse
      );
      expect(results[0].passed).toBe(false);
    });

    it('should fail when schema is invalid JSON', () => {
      const { results } = evaluateAssertions(
        [makeAssertion({ target: 'schema', operator: 'equals', expected: '{invalid}' })],
        jsonResponse
      );
      expect(results[0].passed).toBe(false);
      expect(results[0].message).toContain('not valid JSON');
    });

    it('should fail when response body is not JSON', () => {
      const { results } = evaluateAssertions(
        [makeAssertion({ target: 'schema', operator: 'equals', expected: validSchema })],
        textResponse
      );
      expect(results[0].passed).toBe(false);
    });
  });

  describe('grpcStatusMessage target', () => {
    it('should extract gRPC status message', () => {
      const { results } = evaluateAssertions(
        [makeAssertion({ target: 'grpcStatusMessage', operator: 'equals', expected: 'OK' })],
        grpcResponse
      );
      expect(results[0].passed).toBe(true);
    });

    it('should match error status message', () => {
      const { results } = evaluateAssertions(
        [makeAssertion({ target: 'grpcStatusMessage', operator: 'equals', expected: 'NOT_FOUND' })],
        grpcErrorResponse
      );
      expect(results[0].passed).toBe(true);
    });

    it('should return undefined when grpcStatusMessage not present', () => {
      const { results } = evaluateAssertions(
        [makeAssertion({ target: 'grpcStatusMessage', operator: 'exists' })],
        jsonResponse
      );
      expect(results[0].passed).toBe(false);
    });
  });

  describe('trailer target', () => {
    it('should find trailer by key (case-insensitive)', () => {
      const { results } = evaluateAssertions(
        [makeAssertion({ target: 'trailer', property: 'x-trace-id', operator: 'equals', expected: 'trace-abc' })],
        grpcResponse
      );
      expect(results[0].passed).toBe(true);
    });

    it('should return undefined for missing trailer', () => {
      const { results } = evaluateAssertions(
        [makeAssertion({ target: 'trailer', property: 'x-missing', operator: 'exists' })],
        grpcResponse
      );
      expect(results[0].passed).toBe(false);
    });

    it('should return undefined when no trailers object', () => {
      const { results } = evaluateAssertions(
        [makeAssertion({ target: 'trailer', property: 'anything', operator: 'exists' })],
        jsonResponse
      );
      expect(results[0].passed).toBe(false);
    });
  });

  describe('streamMessageCount target', () => {
    it('should return count of stream messages', () => {
      const { results } = evaluateAssertions(
        [makeAssertion({ target: 'streamMessageCount', operator: 'equals', expected: '3' })],
        grpcResponse
      );
      expect(results[0].passed).toBe(true);
    });

    it('should support numeric comparisons', () => {
      const { results } = evaluateAssertions(
        [makeAssertion({ target: 'streamMessageCount', operator: 'greaterThan', expected: '1' })],
        grpcResponse
      );
      expect(results[0].passed).toBe(true);
    });

    it('should return undefined for non-gRPC response', () => {
      const { results } = evaluateAssertions(
        [makeAssertion({ target: 'streamMessageCount', operator: 'exists' })],
        jsonResponse
      );
      expect(results[0].passed).toBe(false);
    });

    it('should return 0 for gRPC response with empty stream', () => {
      const { results } = evaluateAssertions(
        [makeAssertion({ target: 'streamMessageCount', operator: 'equals', expected: '0' })],
        grpcErrorResponse
      );
      expect(results[0].passed).toBe(true);
    });
  });

  describe('streamMessage target', () => {
    it('should return full message content by index', () => {
      const { results } = evaluateAssertions(
        [makeAssertion({ target: 'streamMessage', property: '0', operator: 'contains', expected: 'msg1' })],
        grpcResponse
      );
      expect(results[0].passed).toBe(true);
    });

    it('should support JSONPath on specific message', () => {
      const { results } = evaluateAssertions(
        [makeAssertion({ target: 'streamMessage', property: '1.$.seq', operator: 'equals', expected: '2' })],
        grpcResponse
      );
      expect(results[0].passed).toBe(true);
    });

    it('should return undefined for out-of-bounds index', () => {
      const { results } = evaluateAssertions(
        [makeAssertion({ target: 'streamMessage', property: '99', operator: 'exists' })],
        grpcResponse
      );
      expect(results[0].passed).toBe(false);
    });

    it('should return undefined when no property specified', () => {
      const { results } = evaluateAssertions(
        [makeAssertion({ target: 'streamMessage', operator: 'exists' })],
        grpcResponse
      );
      expect(results[0].passed).toBe(false);
    });
  });

  describe('gRPC with existing targets', () => {
    it('status target should work with gRPC status codes', () => {
      const { results } = evaluateAssertions(
        [makeAssertion({ target: 'status', operator: 'equals', expected: '0' })],
        grpcResponse
      );
      expect(results[0].passed).toBe(true);
    });

    it('responseTime target should work with gRPC duration', () => {
      const { results } = evaluateAssertions(
        [makeAssertion({ target: 'responseTime', operator: 'lessThan', expected: '100' })],
        grpcResponse
      );
      expect(results[0].passed).toBe(true);
    });

    it('jsonQuery target should work with gRPC response data', () => {
      const { results } = evaluateAssertions(
        [makeAssertion({ target: 'jsonQuery', property: '$.message', operator: 'equals', expected: 'Hello World' })],
        grpcResponse
      );
      expect(results[0].passed).toBe(true);
    });

    it('body target should work with gRPC response data', () => {
      const { results } = evaluateAssertions(
        [makeAssertion({ target: 'body', operator: 'contains', expected: 'Hello World' })],
        grpcResponse
      );
      expect(results[0].passed).toBe(true);
    });

    it('header target should access gRPC initial metadata', () => {
      const { results } = evaluateAssertions(
        [makeAssertion({ target: 'header', property: 'x-request-id', operator: 'equals', expected: 'grpc-123' })],
        grpcResponse
      );
      expect(results[0].passed).toBe(true);
    });

    it('setVariable should extract from gRPC response', () => {
      const { results, variablesToSet } = evaluateAssertions(
        [makeAssertion({ target: 'setVariable', property: '$.message', variableName: 'grpcMsg' })],
        grpcResponse
      );
      expect(results[0].passed).toBe(true);
      expect(variablesToSet[0]).toEqual({ key: 'grpcMsg', value: 'Hello World' });
    });
  });

  describe('array filter operators', () => {
    const arrayResponse = {
      status: 200,
      statusText: 'OK',
      headers: {},
      data: { tags: ['alpha', 'beta-test', 'gamma'] },
      duration: 100,
    };

    it('anyItemContains - passes when any element contains the value', () => {
      const { results } = evaluateAssertions(
        [makeAssertion({ target: 'jsonQuery', property: '$.tags', operator: 'anyItemContains', expected: 'beta' })],
        arrayResponse
      );
      expect(results[0].passed).toBe(true);
    });

    it('anyItemContains - fails when no element contains the value', () => {
      const { results } = evaluateAssertions(
        [makeAssertion({ target: 'jsonQuery', property: '$.tags', operator: 'anyItemContains', expected: 'delta' })],
        arrayResponse
      );
      expect(results[0].passed).toBe(false);
    });

    it('anyItemStartsWith - passes when any element starts with the value', () => {
      const { results } = evaluateAssertions(
        [makeAssertion({ target: 'jsonQuery', property: '$.tags', operator: 'anyItemStartsWith', expected: 'beta' })],
        arrayResponse
      );
      expect(results[0].passed).toBe(true);
    });

    it('anyItemStartsWith - fails when no element starts with the value', () => {
      const { results } = evaluateAssertions(
        [makeAssertion({ target: 'jsonQuery', property: '$.tags', operator: 'anyItemStartsWith', expected: 'test' })],
        arrayResponse
      );
      expect(results[0].passed).toBe(false);
    });

    it('anyItemEndsWith - passes when any element ends with the value', () => {
      const { results } = evaluateAssertions(
        [makeAssertion({ target: 'jsonQuery', property: '$.tags', operator: 'anyItemEndsWith', expected: 'test' })],
        arrayResponse
      );
      expect(results[0].passed).toBe(true);
    });

    it('anyItemEndsWith - fails when no element ends with the value', () => {
      const { results } = evaluateAssertions(
        [makeAssertion({ target: 'jsonQuery', property: '$.tags', operator: 'anyItemEndsWith', expected: 'alpha-x' })],
        arrayResponse
      );
      expect(results[0].passed).toBe(false);
    });

    it('anyItemEquals - passes when any element exactly equals the value', () => {
      const { results } = evaluateAssertions(
        [makeAssertion({ target: 'jsonQuery', property: '$.tags', operator: 'anyItemEquals', expected: 'gamma' })],
        arrayResponse
      );
      expect(results[0].passed).toBe(true);
    });

    it('anyItemEquals - fails when no element exactly equals the value', () => {
      const { results } = evaluateAssertions(
        [makeAssertion({ target: 'jsonQuery', property: '$.tags', operator: 'anyItemEquals', expected: 'gamm' })],
        arrayResponse
      );
      expect(results[0].passed).toBe(false);
    });
  });
});
