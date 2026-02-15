import { writable } from 'svelte/store';
import { formatData } from '@hivefetch/core';

export const previousResponseBody = writable<string | null>(null);
export const previousResponseLabel = writable<string>('');

/**
 * Capture the current response as "previous" before a new response overwrites it.
 */
export function capturePreviousResponse(data: any, label?: string) {
  const formatted = formatData(data);
  if (formatted) {
    previousResponseBody.set(formatted);
    previousResponseLabel.set(label || 'Previous');
  }
}
