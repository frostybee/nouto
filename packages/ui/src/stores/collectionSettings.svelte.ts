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
