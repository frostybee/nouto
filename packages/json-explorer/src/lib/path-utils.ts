/**
 * Utility functions for JSON path manipulation in the JSON Explorer.
 */

/** A single breadcrumb segment. */
export interface PathSegment {
  label: string;
  path: string;
}

/**
 * Build a JSONPath string from a parent path and a child key.
 * Root path is "$".
 */
export function appendPath(parentPath: string, key: string | number): string {
  if (typeof key === 'number') {
    return `${parentPath}[${key}]`;
  }
  // Use dot notation for simple keys, bracket notation for keys with special chars
  if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key)) {
    return `${parentPath}.${key}`;
  }
  return `${parentPath}["${key.replace(/"/g, '\\"')}"]`;
}

/**
 * Parse a JSONPath into breadcrumb segments.
 * "$" -> [{ label: "$", path: "$" }]
 * "$.users[0].name" -> [
 *   { label: "$", path: "$" },
 *   { label: "users", path: "$.users" },
 *   { label: "[0]", path: "$.users[0]" },
 *   { label: "name", path: "$.users[0].name" },
 * ]
 */
export function pathToSegments(path: string): PathSegment[] {
  if (!path || path === '$') {
    return [{ label: '$', path: '$' }];
  }

  const segments: PathSegment[] = [{ label: '$', path: '$' }];
  let remaining = path.slice(1); // Remove leading "$"
  let currentPath = '$';

  while (remaining.length > 0) {
    if (remaining.startsWith('.')) {
      remaining = remaining.slice(1);
      // Read key until next . or [
      const match = remaining.match(/^([a-zA-Z_$][a-zA-Z0-9_$]*)/);
      if (match) {
        currentPath += `.${match[1]}`;
        segments.push({ label: match[1], path: currentPath });
        remaining = remaining.slice(match[1].length);
      } else {
        break;
      }
    } else if (remaining.startsWith('[')) {
      // Bracket notation: [0] or ["key"]
      const bracketMatch = remaining.match(/^\[(\d+|"(?:[^"\\]|\\.)*")\]/);
      if (bracketMatch) {
        currentPath += bracketMatch[0];
        const label = bracketMatch[1].startsWith('"')
          ? bracketMatch[1].slice(1, -1)
          : `[${bracketMatch[1]}]`;
        segments.push({ label, path: currentPath });
        remaining = remaining.slice(bracketMatch[0].length);
      } else {
        break;
      }
    } else {
      break;
    }
  }

  return segments;
}

/**
 * Get the parent path of a JSONPath.
 * "$.users[0].name" -> "$.users[0]"
 * "$.users" -> "$"
 * "$" -> "$"
 */
export function getParentPath(path: string): string {
  if (path === '$') return '$';

  // Remove trailing bracket notation
  const bracketMatch = path.match(/^(.*)\[\d+\]$/);
  if (bracketMatch) return bracketMatch[1];

  const bracketStringMatch = path.match(/^(.*)\["(?:[^"\\]|\\.)*"\]$/);
  if (bracketStringMatch) return bracketStringMatch[1];

  // Remove trailing dot notation
  const dotMatch = path.match(/^(.+)\.[a-zA-Z_$][a-zA-Z0-9_$]*$/);
  if (dotMatch) return dotMatch[1];

  return '$';
}

/**
 * Extract the value at a given JSONPath from a parsed JSON object.
 * Only supports the simple paths we generate (dot and bracket notation).
 */
export function getValueAtPath(json: any, path: string): any {
  if (path === '$') return json;

  const segments = pathToSegments(path);
  let current = json;

  for (let i = 1; i < segments.length; i++) {
    if (current === null || current === undefined) return undefined;
    const seg = segments[i];
    const label = seg.label;

    if (label.startsWith('[') && label.endsWith(']')) {
      // Array index
      const index = parseInt(label.slice(1, -1), 10);
      current = Array.isArray(current) ? current[index] : undefined;
    } else {
      // Object key
      current = typeof current === 'object' ? current[label] : undefined;
    }
  }

  return current;
}
