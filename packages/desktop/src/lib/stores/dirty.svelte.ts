import { invoke } from '@tauri-apps/api/core';

let _dirty = $state(false);

export function getHasUnsavedChanges(): boolean {
  return _dirty;
}

export function setHasUnsavedChanges(value: boolean): void {
  _dirty = value;
  void invoke('set_has_unsaved_changes', { dirty: value });
}
