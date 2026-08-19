import type { AuthState, KeyValue, ScriptConfig, EnvironmentVariable, Assertion } from '../types';

export interface SettingsInitData {
  entityType: 'collection' | 'folder';
  entityName: string;
  collectionId: string;
  folderId?: string;
  initialAuth?: AuthState;
  initialHeaders?: KeyValue[];
  initialVariables?: EnvironmentVariable[];
  initialScripts?: ScriptConfig;
  initialAssertions?: Assertion[];
  initialNotes?: string;
}

/** Payload emitted by CollectionSettingsPanel's `saveCollectionSettings`/`saveFolderSettings`. */
export interface CollectionSettingsSaveData {
  collectionId: string;
  folderId?: string;
  auth?: AuthState;
  headers?: KeyValue[];
  variables?: EnvironmentVariable[];
  scripts?: ScriptConfig;
  assertions?: Assertion[];
  notes?: string;
}

const _settingsData = $state<{ value: SettingsInitData | null }>({ value: null });
const _settingsSavedSignal = $state<{ value: number }>({ value: 0 });

export function settingsData() { return _settingsData.value; }
export function settingsSavedSignal() { return _settingsSavedSignal.value; }

export function initSettings(data: SettingsInitData) {
  _settingsData.value = data;
}

export function notifySettingsSaved() {
  _settingsSavedSignal.value++;
}
