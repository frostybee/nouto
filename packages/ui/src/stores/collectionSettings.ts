import { writable } from 'svelte/store';
import type { AuthState, KeyValue, ScriptConfig, EnvironmentVariable } from '../types';

export interface SettingsInitData {
  entityType: 'collection' | 'folder';
  entityName: string;
  collectionId: string;
  folderId?: string;
  initialAuth?: AuthState;
  initialHeaders?: KeyValue[];
  initialVariables?: EnvironmentVariable[];
  initialScripts?: ScriptConfig;
  initialNotes?: string;
}

export const settingsData = writable<SettingsInitData | null>(null);

export function initSettings(data: SettingsInitData) {
  settingsData.set(data);
}
