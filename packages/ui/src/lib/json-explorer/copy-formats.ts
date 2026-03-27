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
        // Object/array items: put first line on same line as dash
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

export function toCsv(value: any): string {
  if (!Array.isArray(value) || value.length === 0) return '';

  // Collect all unique keys across items
  const keySet = new Set<string>();
  for (const item of value) {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      for (const key of Object.keys(item)) keySet.add(key);
    }
  }
  const headers = [...keySet];
  if (headers.length === 0) return '';

  const escape = (val: any): string => {
    if (val === null || val === undefined) return '';
    const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = [headers.map(escape).join(',')];
  for (const item of value) {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      rows.push(headers.map(h => escape((item as Record<string, any>)[h])).join(','));
    }
  }
  return rows.join('\n');
}

export function toTypeScriptType(value: any, name = 'Root', indent = 0): string {
  const prefix = '  '.repeat(indent);
  const lines: string[] = [];

  if (Array.isArray(value)) {
    if (value.length === 0) {
      lines.push(`${prefix}type ${name} = any[];`);
    } else {
      const itemType = inferTypeScript(value[0], `${name}Item`, indent);
      lines.push(itemType);
      lines.push(`${prefix}type ${name} = ${name}Item[];`);
    }
  } else if (value !== null && typeof value === 'object') {
    lines.push(`${prefix}interface ${name} {`);
    for (const [key, val] of Object.entries(value)) {
      const safeKey = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key) ? key : `"${key}"`;
      lines.push(`${prefix}  ${safeKey}: ${inferTypeScriptInline(val)};`);
    }
    lines.push(`${prefix}}`);
  } else {
    lines.push(`${prefix}type ${name} = ${inferTypeScriptInline(value)};`);
  }

  return lines.join('\n');
}

function inferTypeScript(value: any, name: string, indent: number): string {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return toTypeScriptType(value, name, indent);
  }
  return `type ${name} = ${inferTypeScriptInline(value)};`;
}

function inferTypeScriptInline(value: any): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) {
    if (value.length === 0) return 'any[]';
    return `${inferTypeScriptInline(value[0])}[]`;
  }
  if (typeof value === 'object') return 'Record<string, any>';
  return typeof value;
}

export function toPythonDict(value: any): string {
  return toPythonValue(value, 0);
}

function toPythonValue(value: any, indent: number): string {
  const prefix = '    '.repeat(indent);
  const innerPrefix = '    '.repeat(indent + 1);

  if (value === null) return 'None';
  if (typeof value === 'boolean') return value ? 'True' : 'False';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return JSON.stringify(value);

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    const items = value.map(v => `${innerPrefix}${toPythonValue(v, indent + 1)}`);
    return `[\n${items.join(',\n')}\n${prefix}]`;
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value);
    if (entries.length === 0) return '{}';
    const items = entries.map(([k, v]) => `${innerPrefix}${JSON.stringify(k)}: ${toPythonValue(v, indent + 1)}`);
    return `{\n${items.join(',\n')}\n${prefix}}`;
  }

  return String(value);
}

export function toPhpArray(value: any): string {
  return toPhpValue(value, 0);
}

function toPhpValue(value: any, indent: number): string {
  const prefix = '    '.repeat(indent);
  const innerPrefix = '    '.repeat(indent + 1);

  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    const items = value.map(v => `${innerPrefix}${toPhpValue(v, indent + 1)}`);
    return `[\n${items.join(',\n')},\n${prefix}]`;
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value);
    if (entries.length === 0) return '[]';
    const items = entries.map(([k, v]) =>
      `${innerPrefix}'${k.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}' => ${toPhpValue(v, indent + 1)}`
    );
    return `[\n${items.join(',\n')},\n${prefix}]`;
  }

  return String(value);
}

export function toMarkdownTable(value: any): string {
  if (!Array.isArray(value) || value.length === 0) return '';

  const keySet = new Set<string>();
  for (const item of value) {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      for (const key of Object.keys(item)) keySet.add(key);
    }
  }
  const headers = [...keySet];
  if (headers.length === 0) return '';

  const escape = (val: any): string => {
    if (val === null || val === undefined) return '';
    const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
    return str.replace(/\|/g, '\\|').replace(/\n/g, ' ');
  };

  const lines = [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
  ];

  for (const item of value) {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      const row = headers.map(h => escape((item as Record<string, any>)[h]));
      lines.push(`| ${row.join(' | ')} |`);
    }
  }

  return lines.join('\n');
}
