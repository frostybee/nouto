// Per-tab/panel request undo/redo store.
// In VS Code each webview panel is isolated (one stack per panel).
// In Desktop, each tab has its own stack keyed by tab ID.

import { UndoRedoStack } from './undoRedo.svelte';
import type { RequestState } from './request.svelte';
import {
  request,
  snapshotCurrentRequest,
  setRequestChangeListener,
  suppressUndoTracking,
  bulkSetRequest,
  requestContext,
} from './request.svelte';

const REQUEST_UNDO_MAX_DEPTH = 50;
const REQUEST_COALESCE_MS = 500;

// Per-tab stacks
const stacks = new Map<string, UndoRedoStack<RequestState>>();

// Track the last scope for undo/redo dispatch
let _lastUndoScope: 'request' | 'collection' = 'request';
export function lastUndoScope() { return _lastUndoScope; }
export function setLastUndoScope(scope: 'request' | 'collection') { _lastUndoScope = scope; }

// Track whether undo system is initialized
let _initialized = false;

function getOrCreateStack(tabId: string): UndoRedoStack<RequestState> {
  let stack = stacks.get(tabId);
  if (!stack) {
    stack = new UndoRedoStack<RequestState>({
      maxDepth: REQUEST_UNDO_MAX_DEPTH,
      coalesceMs: REQUEST_COALESCE_MS,
    });
    stacks.set(tabId, stack);
  }
  return stack;
}

/** Get the active tab/panel ID. Falls back to '__default' for VS Code single-panel context. */
function getActiveTabId(): string {
  return requestContext()?.panelId ?? '__default';
}

/** Initialize the request undo system by registering the change listener. Call once at startup. */
export function initRequestUndo() {
  if (_initialized) return;
  _initialized = true;

  setRequestChangeListener((before: RequestState, label: string, mode) => {
    const tabId = getActiveTabId();
    const stack = getOrCreateStack(tabId);

    if (mode === 'coalesce') {
      stack.push(before, label);
    } else {
      stack.pushImmediate(before, label);
    }

    _lastUndoScope = 'request';
  });
}

/** Undo the last request change for the active tab. Returns the label or null. */
export function undoRequest(): string | null {
  const tabId = getActiveTabId();
  const stack = stacks.get(tabId);
  if (!stack) return null;

  const currentState = snapshotCurrentRequest();
  const entry = stack.undo(currentState);
  if (!entry) return null;

  // Restore via bulkSetRequest (which is auto-suppressed from undo tracking)
  bulkSetRequest({
    ...entry.snapshot,
    context: requestContext(),
    // Preserve the original snapshot for dirty tracking
    originalSnapshot: undefined,
  });

  return entry.label;
}

/** Redo the last undone request change for the active tab. Returns the label or null. */
export function redoRequest(): string | null {
  const tabId = getActiveTabId();
  const stack = stacks.get(tabId);
  if (!stack) return null;

  const currentState = snapshotCurrentRequest();
  const entry = stack.redo(currentState);
  if (!entry) return null;

  bulkSetRequest({
    ...entry.snapshot,
    context: requestContext(),
    originalSnapshot: undefined,
  });

  return entry.label;
}

export function canUndoRequest(): boolean {
  const tabId = getActiveTabId();
  const stack = stacks.get(tabId);
  return stack ? stack.canUndo() : false;
}

export function canRedoRequest(): boolean {
  const tabId = getActiveTabId();
  const stack = stacks.get(tabId);
  return stack ? stack.canRedo() : false;
}

export function undoRequestLabel(): string | null {
  const tabId = getActiveTabId();
  const stack = stacks.get(tabId);
  return stack ? stack.undoLabel() : null;
}

export function redoRequestLabel(): string | null {
  const tabId = getActiveTabId();
  const stack = stacks.get(tabId);
  return stack ? stack.redoLabel() : null;
}

/** Clear the undo stack for a specific tab (call on tab close). */
export function clearRequestUndoStack(tabId: string) {
  const stack = stacks.get(tabId);
  if (stack) {
    stack.destroy();
    stacks.delete(tabId);
  }
}

/** Reset the undo stack for a specific tab (call on new request load). */
export function resetRequestUndoStack(tabId?: string) {
  const id = tabId ?? getActiveTabId();
  const stack = stacks.get(id);
  if (stack) {
    stack.clear();
  }
}

/** Flush any pending coalesced changes for the active tab. */
export function flushRequestUndo() {
  const tabId = getActiveTabId();
  const stack = stacks.get(tabId);
  if (stack) {
    stack.flush();
  }
}
