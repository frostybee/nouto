import { writable } from 'svelte/store';
import type { SavedRequest } from '../types';

export interface ConflictState {
  updatedRequest: SavedRequest;
}

export const conflictState = writable<ConflictState | null>(null);

export function setConflict(updatedRequest: SavedRequest): void {
  conflictState.set({ updatedRequest });
}

export function clearConflict(): void {
  conflictState.set(null);
}
