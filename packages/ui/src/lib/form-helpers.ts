/**
 * Form data serialization utilities
 */

let _idCounter = 0;
function formItemId(): string {
  return `fd-${Date.now()}-${_idCounter++}`;
}

export interface FormDataItem {
  id?: string;
  key: string;
  value: string;
  enabled: boolean;
  fieldType?: 'text' | 'file';
  fileName?: string;
  fileSize?: number;
  fileMimeType?: string;
}

/**
 * Parse JSON string to form data array
 */
export function parseFormData(content: string): FormDataItem[] {
  if (!content) return [];
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) {
      return parsed.map((item: FormDataItem) => (item.id ? item : { ...item, id: formItemId() }));
    }
  } catch {
    // If not valid JSON, return empty
  }
  return [];
}

/**
 * Convert form data array to JSON string
 */
export function stringifyFormData(items: FormDataItem[]): string {
  return JSON.stringify(items);
}
