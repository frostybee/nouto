import { describe, it, expect, beforeEach } from 'vitest';
import {
  request,
  setMethod,
  setUrl,
  setParams,
  setHeaders,
  setAuth,
  setBody,
  resetRequest,
} from './request.svelte';
import type { KeyValue, AuthState, BodyState } from './request.svelte';

describe('request store', () => {
  beforeEach(() => {
    resetRequest();
  });

  describe('initial state', () => {
    it('should have correct initial values', () => {
      const state = request;
      expect(state.method).toBe('GET');
      expect(state.url).toBe('');
      expect(state.params).toEqual([]);
      expect(state.headers).toEqual([]);
      expect(state.auth).toEqual({ type: 'none' });
      expect(state.body).toEqual({ type: 'none', content: '' });
    });
  });

  describe('setMethod', () => {
    it('should update the HTTP method', () => {
      setMethod('POST');
      expect(request.method).toBe('POST');
    });

    it('should update to different methods', () => {
      setMethod('PUT');
      expect(request.method).toBe('PUT');

      setMethod('DELETE');
      expect(request.method).toBe('DELETE');

      setMethod('PATCH');
      expect(request.method).toBe('PATCH');
    });
  });

  describe('setUrl', () => {
    it('should update the URL', () => {
      setUrl('https://api.example.com/users');
      expect(request.url).toBe('https://api.example.com/users');
    });

    it('should handle empty URL', () => {
      setUrl('https://api.example.com');
      setUrl('');
      expect(request.url).toBe('');
    });
  });

  describe('setParams', () => {
    it('should update query parameters', () => {
      const params: KeyValue[] = [
        { key: 'page', value: '1', enabled: true },
        { key: 'limit', value: '10', enabled: true },
      ];
      setParams(params);
      expect(request.params).toEqual(
        params.map(p => expect.objectContaining({ key: p.key, value: p.value, enabled: p.enabled }))
      );
    });

    it('should handle empty params', () => {
      setParams([{ key: 'test', value: 'value', enabled: true }]);
      setParams([]);
      expect(request.params).toEqual([]);
    });
  });

  describe('setHeaders', () => {
    it('should update headers', () => {
      const headers: KeyValue[] = [
        { key: 'Content-Type', value: 'application/json', enabled: true },
        { key: 'Authorization', value: 'Bearer token', enabled: true },
      ];
      setHeaders(headers);
      expect(request.headers).toEqual(
        headers.map(h => expect.objectContaining({ key: h.key, value: h.value, enabled: h.enabled }))
      );
    });

    it('should handle disabled headers', () => {
      const headers: KeyValue[] = [
        { key: 'X-Debug', value: 'true', enabled: false },
      ];
      setHeaders(headers);
      expect(request.headers[0].enabled).toBe(false);
    });
  });

  describe('setAuth', () => {
    it('should update auth to basic', () => {
      const auth: AuthState = {
        type: 'basic',
        username: 'user',
        password: 'pass',
      };
      setAuth(auth);
      expect(request.auth).toEqual(auth);
    });

    it('should update auth to bearer', () => {
      const auth: AuthState = {
        type: 'bearer',
        token: 'my-jwt-token',
      };
      setAuth(auth);
      expect(request.auth).toEqual(auth);
    });

    it('should reset auth to none', () => {
      setAuth({ type: 'bearer', token: 'token' });
      setAuth({ type: 'none' });
      expect(request.auth).toEqual({ type: 'none' });
    });
  });

  describe('setBody', () => {
    it('should update body with JSON content', () => {
      const body: BodyState = {
        type: 'json',
        content: '{"name": "test"}',
      };
      setBody(body);
      expect(request.body).toEqual(body);
    });

    it('should update body with form-urlencoded content', () => {
      const body: BodyState = {
        type: 'x-www-form-urlencoded',
        content: 'key1=value1&key2=value2',
      };
      setBody(body);
      expect(request.body).toEqual(body);
    });

    it('should reset body to none', () => {
      setBody({ type: 'json', content: '{}' });
      setBody({ type: 'none', content: '' });
      expect(request.body).toEqual({ type: 'none', content: '' });
    });

    it('should update body with GraphQL content', () => {
      const body: BodyState = {
        type: 'graphql',
        content: 'query { users { id name } }',
        graphqlVariables: '{"limit": 10}',
        graphqlOperationName: 'GetUsers',
      };
      setBody(body);
      const state = request.body;
      expect(state.type).toBe('graphql');
      expect(state.content).toBe('query { users { id name } }');
      expect(state.graphqlVariables).toBe('{"limit": 10}');
      expect(state.graphqlOperationName).toBe('GetUsers');
    });

    it('should update GraphQL body without optional fields', () => {
      const body: BodyState = {
        type: 'graphql',
        content: 'mutation { deleteUser(id: 1) }',
      };
      setBody(body);
      const state = request.body;
      expect(state.type).toBe('graphql');
      expect(state.content).toBe('mutation { deleteUser(id: 1) }');
      expect(state.graphqlVariables).toBeUndefined();
      expect(state.graphqlOperationName).toBeUndefined();
    });
  });

  describe('resetRequest', () => {
    it('should reset all fields to initial state', () => {
      // Set various values
      setMethod('POST');
      setUrl('https://api.example.com');
      setParams([{ key: 'test', value: '1', enabled: true }]);
      setHeaders([{ key: 'X-Test', value: 'true', enabled: true }]);
      setAuth({ type: 'bearer', token: 'token' });
      setBody({ type: 'json', content: '{}' });

      // Reset
      resetRequest();

      // Verify all reset to initial
      const state = request;
      expect(state.method).toBe('GET');
      expect(state.url).toBe('');
      expect(state.params).toEqual([]);
      expect(state.headers).toEqual([]);
      expect(state.auth).toEqual({ type: 'none' });
      expect(state.body).toEqual({ type: 'none', content: '' });
    });
  });

  describe('state immutability', () => {
    it('should deep clone input so mutating the original does not affect the store', () => {
      const params: KeyValue[] = [{ key: 'test', value: 'value', enabled: true }];
      setParams(params);

      // Mutating the original input array should not affect the store
      params.push({ key: 'new', value: 'param', enabled: true });
      expect(request.params).toHaveLength(1);

      // Mutating individual items in the original should not affect the store
      params[0].key = 'modified';
      expect(request.params[0].key).toBe('test');
    });
  });
});
