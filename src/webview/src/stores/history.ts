import { writable, get } from 'svelte/store';
import type { HistoryEntry, ResponseData, HttpMethod, KeyValue, AuthState, BodyState } from '../types';
import { createHistoryEntry } from '../types';
import { postMessage } from '../lib/vscode';

// Maximum history entries to keep
const MAX_HISTORY_ENTRIES = 100;

// History store
export const history = writable<HistoryEntry[]>([]);

// Initialize history from extension
export function initHistory(data: HistoryEntry[]) {
  history.set(data);
}

// Add entry to history
export function addToHistory(
  request: {
    method: HttpMethod;
    url: string;
    params: KeyValue[];
    headers: KeyValue[];
    auth: AuthState;
    body: BodyState;
  },
  response: ResponseData
): HistoryEntry {
  const entry = createHistoryEntry(request, response);

  history.update(entries => {
    // Add new entry at the beginning (most recent first)
    const updated = [entry, ...entries];
    // Limit to max entries
    return updated.slice(0, MAX_HISTORY_ENTRIES);
  });

  // Notify extension to persist
  postMessage({
    type: 'saveHistory',
    data: get(history),
  });

  return entry;
}

// Clear all history
export function clearHistory() {
  history.set([]);

  postMessage({
    type: 'saveHistory',
    data: [],
  });
}

// Delete a single history entry
export function deleteHistoryEntry(id: string) {
  history.update(entries => entries.filter(entry => entry.id !== id));

  postMessage({
    type: 'saveHistory',
    data: get(history),
  });
}

// Get history entry by ID
export function getHistoryEntry(id: string): HistoryEntry | undefined {
  return get(history).find(entry => entry.id === id);
}
