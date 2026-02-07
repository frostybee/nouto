import { writable } from 'svelte/store';

export const activeSchema = writable<object | null>(null);
export const schemaSource = writable<string>('');

export function setSchema(jsonString: string) {
  try {
    const parsed = JSON.parse(jsonString);
    activeSchema.set(parsed);
    schemaSource.set(jsonString);
  } catch {
    // Invalid JSON — don't set
  }
}

export function clearSchema() {
  activeSchema.set(null);
  schemaSource.set('');
}
