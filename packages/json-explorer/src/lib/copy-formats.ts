/**
 * Convert JSON values to various output formats for "Copy As" functionality.
 */

export function toFormattedJson(value: any): string {
  return JSON.stringify(value, null, 2);
}

export function toMinifiedJson(value: any): string {
  return JSON.stringify(value);
}

export function toYaml(value: any, indent = 0): string {
  const prefix = '  '.repeat(indent);

  if (value === null) return 'null';
  if (value === undefined) return 'null';
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') {
    // Escape strings that could be ambiguous in YAML
    if (
      value === '' ||
      value === 'true' || value === 'false' ||
      value === 'null' || value === 'yes' || value === 'no' ||
      /^[\d.eE+-]+$/.test(value) ||
      value.includes(':') || value.includes('#') ||
      value.includes('\n') ||
      value.startsWith(' ') || value.endsWith(' ')
    ) {
      return JSON.stringify(value);
    }
    return value;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    const lines = value.map(item => {
      const converted = toYaml(item, indent + 1);
      if (typeof item === 'object' && item !== null) {
        const firstNewline = converted.indexOf('\n');
        if (firstNewline === -1) return `${prefix}- ${converted}`;
        return `${prefix}- ${converted}`;
      }
      return `${prefix}- ${converted}`;
    });
    return '\n' + lines.join('\n');
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value);
    if (entries.length === 0) return '{}';
    const lines = entries.map(([key, val]) => {
      const safeKey = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key) ? key : JSON.stringify(key);
      const converted = toYaml(val, indent + 1);
      if (typeof val === 'object' && val !== null && !Array.isArray(val) && Object.keys(val).length > 0) {
        return `${prefix}${safeKey}:\n${converted}`;
      }
      return `${prefix}${safeKey}: ${converted}`;
    });
    return (indent > 0 ? '\n' : '') + lines.join('\n');
  }

  return String(value);
}
