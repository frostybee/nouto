/**
 * Auto-detect Unix timestamps and ISO 8601 date strings in JSON values.
 */

export interface TimestampInfo {
  /** Human-readable formatted date, e.g., "Mar 15, 2026, 3:42:05 PM" */
  formatted: string;
  /** Detection kind, e.g., "Unix seconds", "Unix ms", "ISO 8601" */
  kind: string;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)/;

/**
 * Detect whether a JSON value looks like a timestamp.
 * Returns formatted info if detected, or null if not a timestamp.
 */
export function detectTimestamp(value: any, type: string): TimestampInfo | null {
  if (type === 'number') {
    if (value >= 1_000_000_000 && value <= 9_999_999_999) {
      // Unix seconds (2001–2286)
      const date = new Date(value * 1000);
      if (isNaN(date.getTime())) return null;
      return { formatted: formatDate(date), kind: 'Unix seconds' };
    }
    if (value >= 1_000_000_000_000 && value <= 9_999_999_999_999) {
      // Unix milliseconds
      const date = new Date(value);
      if (isNaN(date.getTime())) return null;
      return { formatted: formatDate(date), kind: 'Unix ms' };
    }
    return null;
  }

  if (type === 'string' && typeof value === 'string') {
    if (ISO_DATE_RE.test(value)) {
      const date = new Date(value);
      if (isNaN(date.getTime())) return null;
      return { formatted: formatDate(date), kind: 'ISO 8601' };
    }
    return null;
  }

  return null;
}

function formatDate(date: Date): string {
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'medium' });
}
