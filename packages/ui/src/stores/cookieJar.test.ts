import { describe, it, expect, beforeEach, vi } from 'vitest';

const { mockPostMessage } = vi.hoisted(() => ({
  mockPostMessage: vi.fn(),
}));

vi.mock('../lib/vscode', () => ({
  postMessage: mockPostMessage,
}));

import {
  cookieJars,
  activeCookieJarId,
  cookieJarData,
  activeCookieJar,
  activeCookiesList,
  setCookieJarData,
  loadCookieJars,
  requestCookieJars,
  requestCookieJarData,
  createCookieJar,
  renameCookieJar,
  deleteCookieJar,
  switchCookieJar,
  addCookie,
  updateCookie,
  deleteCookie,
  deleteCookieDomain,
  clearCookieJar,
} from './cookieJar.svelte';

describe('cookieJar store', () => {
  beforeEach(() => {
    mockPostMessage.mockClear();
    loadCookieJars({ jars: [], activeJarId: null });
    setCookieJarData({});
  });

  describe('initial state', () => {
    it('should have empty cookie jars', () => {
      expect(cookieJars()).toEqual([]);
    });

    it('should have null active cookie jar ID', () => {
      expect(activeCookieJarId()).toBeNull();
    });

    it('should have empty cookie jar data', () => {
      expect(cookieJarData()).toEqual({});
    });

    it('should have null active cookie jar', () => {
      expect(activeCookieJar()).toBeNull();
    });

    it('should have empty active cookies list', () => {
      expect(activeCookiesList()).toEqual([]);
    });
  });

  describe('loadCookieJars', () => {
    it('should load jars and active jar ID', () => {
      loadCookieJars({
        jars: [
          { id: 'jar-1', name: 'Default', cookieCount: 5 },
          { id: 'jar-2', name: 'Dev', cookieCount: 2 },
        ],
        activeJarId: 'jar-1',
      });

      expect(cookieJars()).toHaveLength(2);
      expect(cookieJars()[0].name).toBe('Default');
      expect(activeCookieJarId()).toBe('jar-1');
    });

    it('should handle null activeJarId', () => {
      loadCookieJars({ jars: [{ id: 'jar-1', name: 'Default', cookieCount: 0 }], activeJarId: null });
      expect(activeCookieJarId()).toBeNull();
    });

    it('should handle empty jars array', () => {
      loadCookieJars({ jars: [], activeJarId: null });
      expect(cookieJars()).toEqual([]);
    });
  });

  describe('setCookieJarData', () => {
    it('should set domain-grouped cookie data', () => {
      const data = {
        'example.com': [
          { name: 'session', value: 'abc', domain: 'example.com', path: '/', httpOnly: true, secure: true, createdAt: 1000 },
        ],
        'api.example.com': [
          { name: 'token', value: 'xyz', domain: 'api.example.com', path: '/', httpOnly: false, secure: true, createdAt: 2000 },
        ],
      };

      setCookieJarData(data);
      expect(cookieJarData()).toEqual(data);
    });
  });

  describe('activeCookieJar (derived)', () => {
    it('should return the active jar info', () => {
      loadCookieJars({
        jars: [
          { id: 'jar-1', name: 'Default', cookieCount: 5 },
          { id: 'jar-2', name: 'Dev', cookieCount: 2 },
        ],
        activeJarId: 'jar-2',
      });

      const active = activeCookieJar();
      expect(active).not.toBeNull();
      expect(active!.id).toBe('jar-2');
      expect(active!.name).toBe('Dev');
    });

    it('should return null when no active jar matches', () => {
      loadCookieJars({
        jars: [{ id: 'jar-1', name: 'Default', cookieCount: 0 }],
        activeJarId: 'nonexistent',
      });

      expect(activeCookieJar()).toBeNull();
    });
  });

  describe('activeCookiesList (derived)', () => {
    it('should return flattened list of all cookies across domains', () => {
      setCookieJarData({
        'example.com': [
          { name: 'a', value: '1', domain: 'example.com', path: '/', httpOnly: false, secure: false, createdAt: 1000 },
          { name: 'b', value: '2', domain: 'example.com', path: '/', httpOnly: false, secure: false, createdAt: 1000 },
        ],
        'api.example.com': [
          { name: 'c', value: '3', domain: 'api.example.com', path: '/', httpOnly: false, secure: false, createdAt: 1000 },
        ],
      });

      const list = activeCookiesList();
      expect(list).toHaveLength(3);
      expect(list.map(c => c.name).sort()).toEqual(['a', 'b', 'c']);
    });
  });

  describe('switchCookieJar', () => {
    it('should update local active jar ID', () => {
      loadCookieJars({
        jars: [
          { id: 'jar-1', name: 'Default', cookieCount: 0 },
          { id: 'jar-2', name: 'Dev', cookieCount: 0 },
        ],
        activeJarId: 'jar-1',
      });

      switchCookieJar('jar-2');
      expect(activeCookieJarId()).toBe('jar-2');
    });

    it('should send setActiveCookieJar message', () => {
      switchCookieJar('jar-2');
      expect(mockPostMessage).toHaveBeenCalledWith({
        type: 'setActiveCookieJar',
        data: { id: 'jar-2' },
      });
    });

    it('should handle null id', () => {
      switchCookieJar(null);
      expect(activeCookieJarId()).toBeNull();
      expect(mockPostMessage).toHaveBeenCalledWith({
        type: 'setActiveCookieJar',
        data: { id: null },
      });
    });
  });

  describe('postMessage calls', () => {
    it('requestCookieJars should send getCookieJars message', () => {
      requestCookieJars();
      expect(mockPostMessage).toHaveBeenCalledWith({ type: 'getCookieJars' });
    });

    it('requestCookieJarData should send getCookieJar message', () => {
      requestCookieJarData();
      expect(mockPostMessage).toHaveBeenCalledWith({ type: 'getCookieJar' });
    });

    it('createCookieJar should send createCookieJar message', () => {
      createCookieJar('New Jar');
      expect(mockPostMessage).toHaveBeenCalledWith({
        type: 'createCookieJar',
        data: { name: 'New Jar' },
      });
    });

    it('renameCookieJar should send renameCookieJar message', () => {
      renameCookieJar('jar-1', 'Renamed Jar');
      expect(mockPostMessage).toHaveBeenCalledWith({
        type: 'renameCookieJar',
        data: { id: 'jar-1', name: 'Renamed Jar' },
      });
    });

    it('deleteCookieJar should send deleteCookieJar message', () => {
      deleteCookieJar('jar-1');
      expect(mockPostMessage).toHaveBeenCalledWith({
        type: 'deleteCookieJar',
        data: { id: 'jar-1' },
      });
    });

    it('addCookie should send addCookie message', () => {
      addCookie({
        name: 'session',
        value: 'abc123',
        domain: 'example.com',
        path: '/',
        httpOnly: true,
        secure: true,
        sameSite: 'Lax',
      });

      expect(mockPostMessage).toHaveBeenCalledWith({
        type: 'addCookie',
        data: {
          name: 'session',
          value: 'abc123',
          domain: 'example.com',
          path: '/',
          httpOnly: true,
          secure: true,
          sameSite: 'Lax',
          expires: undefined,
        },
      });
    });

    it('updateCookie should send updateCookie message', () => {
      updateCookie('oldName', 'old.com', '/', {
        name: 'newName',
        value: 'newVal',
        domain: 'new.com',
        path: '/api',
        httpOnly: false,
        secure: false,
      });

      expect(mockPostMessage).toHaveBeenCalledWith({
        type: 'updateCookie',
        data: {
          oldName: 'oldName',
          oldDomain: 'old.com',
          oldPath: '/',
          cookie: {
            name: 'newName',
            value: 'newVal',
            domain: 'new.com',
            path: '/api',
            httpOnly: false,
            secure: false,
            expires: undefined,
            sameSite: undefined,
          },
        },
      });
    });

    it('deleteCookie should send deleteCookie message', () => {
      deleteCookie('session', 'example.com', '/');
      expect(mockPostMessage).toHaveBeenCalledWith({
        type: 'deleteCookie',
        data: { name: 'session', domain: 'example.com', path: '/' },
      });
    });

    it('deleteCookieDomain should send deleteCookieDomain message', () => {
      deleteCookieDomain('example.com');
      expect(mockPostMessage).toHaveBeenCalledWith({
        type: 'deleteCookieDomain',
        data: { domain: 'example.com' },
      });
    });

    it('clearCookieJar should send clearCookieJar message', () => {
      clearCookieJar();
      expect(mockPostMessage).toHaveBeenCalledWith({ type: 'clearCookieJar' });
    });
  });
});
