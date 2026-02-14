import { JSONPath } from 'jsonpath-plus';

export interface JsonPathResult {
  data: any;
  matchCount: number;
  error: string | null;
}

/**
 * Filter JSON data using a JSONPath expression.
 */
export function filterByJsonPath(data: any, query: string): JsonPathResult {
  if (!query || !query.trim()) {
    return { data, matchCount: 0, error: null };
  }

  try {
    const parsed = typeof data === 'string' ? JSON.parse(data) : data;
    const result = JSONPath({ path: query, json: parsed, wrap: true });

    return {
      data: result.length === 1 ? result[0] : result,
      matchCount: result.length,
      error: null,
    };
  } catch (err) {
    return {
      data: null,
      matchCount: 0,
      error: (err as Error).message,
    };
  }
}
