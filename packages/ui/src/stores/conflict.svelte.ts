import type { SavedRequest } from '../types';

export interface ConflictState {
  updatedRequest: SavedRequest;
}

const state = $state<{ value: ConflictState | null }>({ value: null });

export function conflictState() { return state.value; }

export function setConflict(updatedRequest: SavedRequest): void {
  state.value = { updatedRequest };
}

export function clearConflict(): void {
  state.value = null;
}
