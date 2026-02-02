/**
 * Search and filter utilities
 */

import type { HistoryEntry } from '../types';

/**
 * Filter history entries by searching URL, method, and status code
 */
export function filterHistory(entries: HistoryEntry[], query: string): HistoryEntry[] {
  if (!query.trim()) return entries;

  const lowerQuery = query.toLowerCase();
  return entries.filter(entry => {
    // Search in URL
    if (entry.url.toLowerCase().includes(lowerQuery)) return true;
    // Search in method
    if (entry.method.toLowerCase().includes(lowerQuery)) return true;
    // Search in status code
    if (entry.status.toString().includes(lowerQuery)) return true;
    return false;
  });
}
