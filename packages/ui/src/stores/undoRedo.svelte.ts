// Generic undo/redo stack with optional coalescing for rapid changes.
// Used by requestUndo and collectionUndo stores.

export interface UndoRedoOptions {
  maxDepth: number;
  coalesceMs?: number; // 0 or omitted = no coalescing
}

interface StackEntry<T> {
  snapshot: T;
  label: string;
  timestamp: number;
}

export class UndoRedoStack<T> {
  private _undoStack: StackEntry<T>[] = [];
  private _redoStack: StackEntry<T>[] = [];
  private readonly maxDepth: number;
  private readonly coalesceMs: number;
  private coalesceTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingEntry: StackEntry<T> | null = null;

  constructor(options: UndoRedoOptions) {
    this.maxDepth = options.maxDepth;
    this.coalesceMs = options.coalesceMs ?? 0;
  }

  /** Push a snapshot. If coalescing is enabled, rapid pushes merge into one entry. */
  push(snapshot: T, label: string): void {
    if (this.coalesceMs <= 0) {
      this.commitEntry({ snapshot, label, timestamp: Date.now() });
      return;
    }

    // Coalescing: update pending entry and restart the timer
    if (this.coalesceTimer !== null) {
      clearTimeout(this.coalesceTimer);
    }

    // If there is no pending entry yet, this is the "before" state to capture
    if (!this.pendingEntry) {
      this.pendingEntry = { snapshot, label, timestamp: Date.now() };
    }
    // Keep the original "before" snapshot but update the label
    this.pendingEntry.label = label;

    this.coalesceTimer = setTimeout(() => {
      this.flushPending();
    }, this.coalesceMs);
  }

  /** Push immediately, bypassing coalescing. Flushes any pending entry first. */
  pushImmediate(snapshot: T, label: string): void {
    this.flushPending();
    this.commitEntry({ snapshot, label, timestamp: Date.now() });
  }

  /** Flush any pending coalesced snapshot to the undo stack. */
  flush(): void {
    this.flushPending();
  }

  /** Undo: returns the previous snapshot, or null if empty. */
  undo(currentState: T): { snapshot: T; label: string } | null {
    this.flushPending();
    if (this._undoStack.length === 0) return null;

    const entry = this._undoStack.pop()!;
    this._redoStack.push({ snapshot: currentState, label: entry.label, timestamp: Date.now() });
    return { snapshot: entry.snapshot, label: entry.label };
  }

  /** Redo: returns the next snapshot, or null if empty. */
  redo(currentState: T): { snapshot: T; label: string } | null {
    this.flushPending();
    if (this._redoStack.length === 0) return null;

    const entry = this._redoStack.pop()!;
    this._undoStack.push({ snapshot: currentState, label: entry.label, timestamp: Date.now() });
    return { snapshot: entry.snapshot, label: entry.label };
  }

  canUndo(): boolean {
    return this._undoStack.length > 0 || this.pendingEntry !== null;
  }

  canRedo(): boolean {
    return this._redoStack.length > 0;
  }

  undoLabel(): string | null {
    if (this.pendingEntry) return this.pendingEntry.label;
    const top = this._undoStack[this._undoStack.length - 1];
    return top ? top.label : null;
  }

  redoLabel(): string | null {
    const top = this._redoStack[this._redoStack.length - 1];
    return top ? top.label : null;
  }

  /** Reset both stacks. */
  clear(): void {
    this._undoStack = [];
    this._redoStack = [];
    this.cancelPending();
  }

  /** Cleanup timer on destroy. */
  destroy(): void {
    this.cancelPending();
  }

  // --- Private ---

  private commitEntry(entry: StackEntry<T>): void {
    this._undoStack.push(entry);
    // Enforce max depth
    if (this._undoStack.length > this.maxDepth) {
      this._undoStack.shift();
    }
    // Any new change clears the redo stack
    this._redoStack = [];
  }

  private flushPending(): void {
    if (this.coalesceTimer !== null) {
      clearTimeout(this.coalesceTimer);
      this.coalesceTimer = null;
    }
    if (this.pendingEntry) {
      this.commitEntry(this.pendingEntry);
      this.pendingEntry = null;
    }
  }

  private cancelPending(): void {
    if (this.coalesceTimer !== null) {
      clearTimeout(this.coalesceTimer);
      this.coalesceTimer = null;
    }
    this.pendingEntry = null;
  }
}
