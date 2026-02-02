/**
 * JSON formatting and syntax highlighting utilities
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

/**
 * Apply syntax highlighting to a JSON string, returning HTML
 */
export function highlightJson(json: string): string {
  if (!json) return '';

  // Escape HTML first
  let escaped = json
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Apply syntax highlighting
  // Strings (including property names in quotes)
  escaped = escaped.replace(
    /"([^"\\]|\\.)*"/g,
    (match) => {
      // Check if it's a key (followed by :) or a value
      return `<span class="json-string">${match}</span>`;
    }
  );

  // Numbers
  escaped = escaped.replace(
    /\b(-?\d+\.?\d*([eE][+-]?\d+)?)\b/g,
    '<span class="json-number">$1</span>'
  );

  // Booleans and null
  escaped = escaped.replace(
    /\b(true|false|null)\b/g,
    '<span class="json-keyword">$1</span>'
  );

  return escaped;
}
