/**
 * JSON formatting utilities
 */

/**
 * Format data as a string, with JSON prettification if applicable
 */
export function formatData(data: any): string {
  if (data === null || data === undefined) return '';
  if (typeof data === 'string') return data;
  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return String(data);
  }
}

/**
 * Format data as a compact JSON string with no indentation
 */
export function formatDataRaw(data: any): string {
  if (data === null || data === undefined) return '';
  if (typeof data === 'string') return data;
  try {
    return JSON.stringify(data);
  } catch {
    return String(data);
  }
}

/**
 * Check if content is JSON based on content-type or data structure
 */
export function isJsonContent(contentType: string, data: any): boolean {
  if (contentType.includes('application/json')) return true;
  if (typeof data === 'object' && data !== null) return true;
  if (typeof data === 'string') {
    try {
      JSON.parse(data);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}
