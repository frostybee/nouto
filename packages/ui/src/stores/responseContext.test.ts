import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import {
  responseContext,
  storeResponse,
  getResponse,
  getLastResponse,
  getResponseValue,
  getResponseValueById,
  getResponseValueByName,
  clearResponseContext,
  clearResponse,
} from './responseContext';
import type { ResponseData } from '../types';

const makeResponse = (overrides: Partial<ResponseData> = {}): ResponseData => ({
  status: 200,
  statusText: 'OK',
  headers: { 'content-type': 'application/json' },
  data: { token: 'abc123', user: { name: 'Alice', id: 42 } },
  duration: 150,
  size: 256,
  ...overrides,
});

describe('responseContext store', () => {
  beforeEach(() => {
    clearResponseContext();
  });

  describe('storeResponse', () => {
    it('should store a response by request ID', () => {
      const response = makeResponse();
      storeResponse('req-1', response);

      expect(getResponse('req-1')).toEqual(response);
    });

    it('should set lastResponse', () => {
      const response = makeResponse();
      storeResponse('req-1', response);

      expect(getLastResponse()).toEqual(response);
    });

    it('should store name-to-id mapping when requestName is provided', () => {
      storeResponse('req-1', makeResponse(), 'Login');

      const ctx = get(responseContext);
      expect(ctx.nameToId.get('Login')).toBe('req-1');
    });

    it('should not store name mapping when requestName is omitted', () => {
      storeResponse('req-1', makeResponse());

      const ctx = get(responseContext);
      expect(ctx.nameToId.size).toBe(0);
    });

    it('should update lastResponse to most recent call', () => {
      const resp1 = makeResponse({ status: 200 });
      const resp2 = makeResponse({ status: 201 });

      storeResponse('req-1', resp1, 'First');
      storeResponse('req-2', resp2, 'Second');

      expect(getLastResponse()!.status).toBe(201);
    });
  });

  describe('getResponseValueByName', () => {
    it('should return body field by request name', () => {
      storeResponse('req-1', makeResponse(), 'Login');

      expect(getResponseValueByName('Login', 'body.token')).toBe('abc123');
    });

    it('should return nested body field', () => {
      storeResponse('req-1', makeResponse(), 'Login');

      expect(getResponseValueByName('Login', 'body.user.name')).toBe('Alice');
    });

    it('should return status by request name', () => {
      storeResponse('req-1', makeResponse({ status: 201 }), 'Create');

      expect(getResponseValueByName('Create', 'status')).toBe(201);
    });

    it('should return statusText by request name', () => {
      storeResponse('req-1', makeResponse({ statusText: 'Created' }), 'Create');

      expect(getResponseValueByName('Create', 'statusText')).toBe('Created');
    });

    it('should return header by request name', () => {
      storeResponse('req-1', makeResponse(), 'Login');

      expect(getResponseValueByName('Login', 'headers.content-type')).toBe('application/json');
    });

    it('should return undefined for unknown request name', () => {
      storeResponse('req-1', makeResponse(), 'Login');

      expect(getResponseValueByName('Unknown', 'body.token')).toBeUndefined();
    });

    it('should return undefined for nonexistent path', () => {
      storeResponse('req-1', makeResponse(), 'Login');

      expect(getResponseValueByName('Login', 'body.nonexistent')).toBeUndefined();
    });

    it('should be case-sensitive on request names', () => {
      storeResponse('req-1', makeResponse(), 'Login');

      expect(getResponseValueByName('login', 'body.token')).toBeUndefined();
      expect(getResponseValueByName('LOGIN', 'body.token')).toBeUndefined();
    });

    it('should handle multiple named responses', () => {
      storeResponse('req-1', makeResponse({ data: { token: 'first' } }), 'Login');
      storeResponse('req-2', makeResponse({ data: { token: 'second' } }), 'Refresh');

      expect(getResponseValueByName('Login', 'body.token')).toBe('first');
      expect(getResponseValueByName('Refresh', 'body.token')).toBe('second');
    });
  });

  describe('getResponseValueById', () => {
    it('should return body field by request ID', () => {
      storeResponse('req-1', makeResponse());

      expect(getResponseValueById('req-1', 'body.token')).toBe('abc123');
    });

    it('should return undefined for unknown ID', () => {
      expect(getResponseValueById('nonexistent', 'body.token')).toBeUndefined();
    });
  });

  describe('getResponseValue (last response)', () => {
    it('should return body field from last response', () => {
      storeResponse('req-1', makeResponse());

      expect(getResponseValue('body.token')).toBe('abc123');
    });

    it('should return status from last response', () => {
      storeResponse('req-1', makeResponse({ status: 404 }));

      expect(getResponseValue('status')).toBe(404);
    });

    it('should return undefined when no response stored', () => {
      expect(getResponseValue('body.token')).toBeUndefined();
    });
  });

  describe('clearResponse', () => {
    it('should remove a specific response', () => {
      storeResponse('req-1', makeResponse());
      storeResponse('req-2', makeResponse());

      clearResponse('req-1');

      expect(getResponse('req-1')).toBeNull();
      expect(getResponse('req-2')).not.toBeNull();
    });
  });

  describe('clearResponseContext', () => {
    it('should clear all stored responses', () => {
      storeResponse('req-1', makeResponse(), 'Login');
      storeResponse('req-2', makeResponse(), 'Profile');

      clearResponseContext();

      const ctx = get(responseContext);
      expect(ctx.responses.size).toBe(0);
      expect(ctx.nameToId.size).toBe(0);
      expect(ctx.lastResponse).toBeNull();
    });
  });
});
