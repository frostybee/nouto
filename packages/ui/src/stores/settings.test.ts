import { describe, it, expect, beforeEach, vi } from 'vitest';

const { mockPostMessage } = vi.hoisted(() => ({
  mockPostMessage: vi.fn(),
}));

vi.mock('../lib/vscode', () => ({
  postMessage: mockPostMessage,
}));

vi.mock('../lib/shortcuts', () => ({
  resolveShortcuts: vi.fn((shortcuts: any) => shortcuts),
  bindingToDisplayString: vi.fn((binding: any) => JSON.stringify(binding)),
  SHORTCUT_DEFINITIONS: {},
}));

import {
  settingsOpen,
  setSettingsOpen,
  settings,
  hasWorkspace,
  loadSettings,
  resetAllShortcuts,
  resetShortcut,
  updateShortcut,
} from './settings.svelte';

describe('settings store', () => {
  beforeEach(() => {
    mockPostMessage.mockClear();
    setSettingsOpen(false);
    loadSettings({
      autoCorrectUrls: false,
      shortcuts: {},
      minimap: 'auto',
      saveResponseBody: true,
      sslRejectUnauthorized: true,
      storageMode: 'global',
      hasWorkspace: false,
    });
  });

  describe('initial state', () => {
    it('should have settingsOpen as false', () => {
      expect(settingsOpen()).toBe(false);
    });

    it('should have default settings values', () => {
      expect(settings.autoCorrectUrls).toBe(false);
      expect(settings.shortcuts).toEqual({});
      expect(settings.minimap).toBe('auto');
      expect(settings.saveResponseBody).toBe(true);
      expect(settings.sslRejectUnauthorized).toBe(true);
      expect(settings.storageMode).toBe('global');
    });

    it('should have hasWorkspace as false', () => {
      expect(hasWorkspace()).toBe(false);
    });
  });

  describe('setSettingsOpen', () => {
    it('should set settingsOpen to true', () => {
      setSettingsOpen(true);
      expect(settingsOpen()).toBe(true);
    });

    it('should set settingsOpen to false', () => {
      setSettingsOpen(true);
      setSettingsOpen(false);
      expect(settingsOpen()).toBe(false);
    });
  });

  describe('loadSettings', () => {
    it('should update all settings fields', () => {
      loadSettings({
        autoCorrectUrls: true,
        shortcuts: { sendRequest: 'Ctrl+Enter' },
        minimap: 'always',
        saveResponseBody: false,
        sslRejectUnauthorized: false,
        storageMode: 'workspace',
        hasWorkspace: true,
      });

      expect(settings.autoCorrectUrls).toBe(true);
      expect(settings.shortcuts).toEqual({ sendRequest: 'Ctrl+Enter' });
      expect(settings.minimap).toBe('always');
      expect(settings.saveResponseBody).toBe(false);
      expect(settings.sslRejectUnauthorized).toBe(false);
      expect(settings.storageMode).toBe('workspace');
      expect(hasWorkspace()).toBe(true);
    });

    it('should set globalProxy when provided', () => {
      const proxy = {
        enabled: true,
        protocol: 'http' as const,
        host: 'proxy.example.com',
        port: 8080,
      };
      loadSettings({
        autoCorrectUrls: false,
        shortcuts: {},
        minimap: 'auto',
        saveResponseBody: true,
        sslRejectUnauthorized: true,
        storageMode: 'global',
        globalProxy: proxy,
      });

      expect(settings.globalProxy).toEqual(proxy);
    });

    it('should set defaultTimeout when provided', () => {
      loadSettings({
        autoCorrectUrls: false,
        shortcuts: {},
        minimap: 'auto',
        saveResponseBody: true,
        sslRejectUnauthorized: true,
        storageMode: 'global',
        defaultTimeout: 5000,
      });

      expect(settings.defaultTimeout).toBe(5000);
    });

    it('should set defaultFollowRedirects and defaultMaxRedirects', () => {
      loadSettings({
        autoCorrectUrls: false,
        shortcuts: {},
        minimap: 'auto',
        saveResponseBody: true,
        sslRejectUnauthorized: true,
        storageMode: 'global',
        defaultFollowRedirects: true,
        defaultMaxRedirects: 5,
      });

      expect(settings.defaultFollowRedirects).toBe(true);
      expect(settings.defaultMaxRedirects).toBe(5);
    });

    it('should set globalClientCert when provided', () => {
      const cert = { certPath: '/path/to/cert', keyPath: '/path/to/key' };
      loadSettings({
        autoCorrectUrls: false,
        shortcuts: {},
        minimap: 'auto',
        saveResponseBody: true,
        sslRejectUnauthorized: true,
        storageMode: 'global',
        globalClientCert: cert,
      });

      expect(settings.globalClientCert).toEqual(cert);
    });

    it('should default hasWorkspace to false when not provided', () => {
      loadSettings({
        autoCorrectUrls: false,
        shortcuts: {},
        minimap: 'auto',
        saveResponseBody: true,
        sslRejectUnauthorized: true,
        storageMode: 'global',
      });

      expect(hasWorkspace()).toBe(false);
    });

    it('should default globalProxy to null when not provided', () => {
      loadSettings({
        autoCorrectUrls: false,
        shortcuts: {},
        minimap: 'auto',
        saveResponseBody: true,
        sslRejectUnauthorized: true,
        storageMode: 'global',
      });

      expect(settings.globalProxy).toBeNull();
    });
  });

  describe('resetAllShortcuts', () => {
    it('should clear all shortcuts', () => {
      loadSettings({
        autoCorrectUrls: false,
        shortcuts: { sendRequest: 'Ctrl+Enter' },
        minimap: 'auto',
        saveResponseBody: true,
        sslRejectUnauthorized: true,
        storageMode: 'global',
      });

      resetAllShortcuts();
      expect(settings.shortcuts).toEqual({});
    });

    it('should call postMessage with updateSettings', () => {
      resetAllShortcuts();
      expect(mockPostMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'updateSettings' })
      );
    });
  });

  describe('resetShortcut', () => {
    it('should remove a specific shortcut override', () => {
      loadSettings({
        autoCorrectUrls: false,
        shortcuts: { sendRequest: 'Ctrl+Enter', toggleSidebar: 'Ctrl+B' } as any,
        minimap: 'auto',
        saveResponseBody: true,
        sslRejectUnauthorized: true,
        storageMode: 'global',
      });

      resetShortcut('sendRequest' as any);
      expect(settings.shortcuts).not.toHaveProperty('sendRequest');
      expect((settings.shortcuts as any).toggleSidebar).toBe('Ctrl+B');
    });

    it('should call postMessage with updateSettings', () => {
      resetShortcut('sendRequest' as any);
      expect(mockPostMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'updateSettings' })
      );
    });
  });

  describe('updateShortcut', () => {
    it('should call postMessage with updateSettings', () => {
      updateShortcut('sendRequest' as any, { key: 'Enter', ctrlOrCmd: true } as any);
      expect(mockPostMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'updateSettings' })
      );
    });
  });
});
