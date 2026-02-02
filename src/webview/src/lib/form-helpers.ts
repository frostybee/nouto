/**
 * Form data serialization utilities
 */

export interface FormDataItem {
  key: string;
  value: string;
  enabled: boolean;
}

/**
 * Parse JSON string to form data array
 */
export function parseFormData(content: string): FormDataItem[] {
  if (!content) return [];
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) {
      return parsed;
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
