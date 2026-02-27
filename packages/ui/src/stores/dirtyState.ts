import { writable } from 'svelte/store';

export const dirtyRequestIds = writable<Set<string>>(new Set());

export function setDirtyRequestIds(ids: string[]) {
  dirtyRequestIds.set(new Set(ids));
}
