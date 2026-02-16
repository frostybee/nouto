import { writable } from 'svelte/store';
import type { AuthState, KeyValue, ScriptConfig } from '../types';

export interface SettingsInitData {
  entityType: 'collection' | 'folder';
  entityName: string;
  collectionId: string;
  folderId?: string;
  initialAuth?: AuthState;
  initialHeaders?: KeyValue[];
  initialScripts?: ScriptConfig;
}

export const settingsData = writable<SettingsInitData | null>(null);

export function initSettings(data: SettingsInitData) {
  settingsData.set(data);
}
