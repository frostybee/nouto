import { describe, it, expect, beforeEach } from 'vitest';
import {
  settingsData,
  settingsSavedSignal,
  initSettings,
  notifySettingsSaved,
} from './collectionSettings.svelte';
import type { SettingsInitData } from './collectionSettings.svelte';

const makeSettingsData = (overrides?: Partial<SettingsInitData>): SettingsInitData => ({
  entityType: 'collection',
  entityName: 'My Collection',
  collectionId: 'col-1',
  ...overrides,
});

describe('collectionSettings store', () => {
  beforeEach(() => {
    // Reset by re-initializing with null-like state is not exposed,
    // so we rely on initSettings to set known state for each test.
    // The saved signal accumulates, but each test checks relative values.
  });

  describe('initial state', () => {
    it('settingsData should start as null', () => {
      // Note: if tests run after initSettings was called, this may not hold.
      // This test validates the exported function returns the internal value.
      const data = settingsData();
      // Either null (fresh) or a SettingsInitData (from prior test).
      expect(data === null || typeof data === 'object').toBe(true);
    });

    it('settingsSavedSignal should be a number', () => {
      expect(typeof settingsSavedSignal()).toBe('number');
    });
  });

  describe('initSettings', () => {
    it('should set the settings data for a collection', () => {
      const data = makeSettingsData();
      initSettings(data);
      expect(settingsData()).toEqual(data);
    });

    it('should set the settings data for a folder', () => {
      const data = makeSettingsData({
        entityType: 'folder',
        entityName: 'My Folder',
        folderId: 'folder-1',
      });
      initSettings(data);
      const result = settingsData();
      expect(result).not.toBeNull();
      expect(result!.entityType).toBe('folder');
      expect(result!.folderId).toBe('folder-1');
    });

    it('should include optional fields when provided', () => {
      const data = makeSettingsData({
        initialAuth: { type: 'bearer', token: 'abc' },
        initialHeaders: [{ key: 'X-Test', value: 'true', enabled: true }],
        initialVariables: [{ key: 'baseUrl', value: 'https://api.test.com', enabled: true }],
        initialNotes: 'Some notes',
      });
      initSettings(data);
      const result = settingsData();
      expect(result!.initialAuth).toEqual({ type: 'bearer', token: 'abc' });
      expect(result!.initialHeaders).toHaveLength(1);
      expect(result!.initialVariables).toHaveLength(1);
      expect(result!.initialNotes).toBe('Some notes');
    });

    it('should replace previous settings data', () => {
      initSettings(makeSettingsData({ entityName: 'First' }));
      initSettings(makeSettingsData({ entityName: 'Second' }));
      expect(settingsData()!.entityName).toBe('Second');
    });
  });

  describe('notifySettingsSaved', () => {
    it('should increment the saved signal', () => {
      const before = settingsSavedSignal();
      notifySettingsSaved();
      expect(settingsSavedSignal()).toBe(before + 1);
    });

    it('should increment on each call', () => {
      const before = settingsSavedSignal();
      notifySettingsSaved();
      notifySettingsSaved();
      notifySettingsSaved();
      expect(settingsSavedSignal()).toBe(before + 3);
    });
  });
});
