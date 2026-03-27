// Global collection tree undo/redo store.
// A single undo stack for all collection structural operations
// (add, delete, rename, move, reorder, duplicate).

import type { Collection } from '../types';
import { UndoRedoStack } from './undoRedo.svelte';
import {
  setCollections,
  setCollectionChangeListener,
  suppressCollectionUndoTracking,
  collections,
} from './collections.svelte';
import { postMessage } from '../lib/vscode';
import { setLastUndoScope } from './requestUndo.svelte';
import { reconcileTrash } from './trash.svelte';

const COLLECTION_UNDO_MAX_DEPTH = 20;

const collectionStack = new UndoRedoStack<Collection[]>({
  maxDepth: COLLECTION_UNDO_MAX_DEPTH,
  coalesceMs: 0, // All collection operations are discrete
});

let _initialized = false;

/** Initialize the collection undo system by registering the change listener. Call once at startup. */
export function initCollectionUndo() {
  if (_initialized) return;
  _initialized = true;

  setCollectionChangeListener((before: Collection[], label: string) => {
    collectionStack.pushImmediate(before, label);
    setLastUndoScope('collection');
  });
}

/** Persist the current collection state to the backend. */
function persistCollections() {
  postMessage({
    type: 'saveCollections',
    data: $state.snapshot(collections()),
  });
}

/** Undo the last collection change. Returns the label or null. */
export function undoCollection(): string | null {
  const currentState = JSON.parse(JSON.stringify($state.snapshot(collections()))) as Collection[];
  const entry = collectionStack.undo(currentState);
  if (!entry) return null;

  // Restore without triggering undo tracking
  suppressCollectionUndoTracking(() => {
    setCollections(entry.snapshot);
  });

  // Persist the restored state to the backend
  persistCollections();

  // Remove any trash entries whose items were restored by undo
  reconcileTrash(entry.snapshot);

  return entry.label;
}

/** Redo the last undone collection change. Returns the label or null. */
export function redoCollection(): string | null {
  const currentState = JSON.parse(JSON.stringify($state.snapshot(collections()))) as Collection[];
  const entry = collectionStack.redo(currentState);
  if (!entry) return null;

  suppressCollectionUndoTracking(() => {
    setCollections(entry.snapshot);
  });

  persistCollections();

  // Reconcile trash after redo as well
  reconcileTrash(entry.snapshot);

  return entry.label;
}

export function canUndoCollection(): boolean {
  return collectionStack.canUndo();
}

export function canRedoCollection(): boolean {
  return collectionStack.canRedo();
}

export function undoCollectionLabel(): string | null {
  return collectionStack.undoLabel();
}

export function redoCollectionLabel(): string | null {
  return collectionStack.redoLabel();
}

/** Clear the collection undo stack (e.g., on full reload). */
export function clearCollectionUndoStack() {
  collectionStack.clear();
}
