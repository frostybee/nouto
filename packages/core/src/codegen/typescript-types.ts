import type { CodegenRequest, CodegenTarget } from './index';

/**
 * Infer a TypeScript interface name from a URL path segment.
 * e.g., /api/users → Users, /api/user/123/posts → Posts
 */
function inferRootName(url: string): string {
  try {
    const pathname = new URL(url, 'https://placeholder').pathname;
    const segments = pathname.split('/').filter(Boolean);
    // Walk backwards to find a non-numeric, non-param segment
    for (let i = segments.length - 1; i >= 0; i--) {
      const seg = segments[i];
      if (/^\d+$/.test(seg) || seg.startsWith('{') || seg.startsWith(':')) continue;
      return pascalCase(seg);
    }
  } catch {}
  return 'Root';
}

function pascalCase(str: string): string {
  return str
    .replace(/[-_]+(.)/g, (_, c) => c.toUpperCase())
    .replace(/^./, c => c.toUpperCase())
    // Remove trailing 's' for singularization (simple heuristic)
    .replace(/s$/, '');
}

function singularize(name: string): string {
  if (name.endsWith('s') && !name.endsWith('ss') && !name.endsWith('us')) {
    return name.slice(0, -1);
  }
  return name;
}

interface TypeInfo {
  inline: string;
  interfaces: Map<string, string>; // name → interface definition
}

function inferType(value: unknown, name: string, interfaces: Map<string, string>, depth: number): string {
  if (value === null || value === undefined) return 'unknown';
  if (typeof value === 'string') return 'string';
  if (typeof value === 'number') return Number.isInteger(value) ? 'number' : 'number';
  if (typeof value === 'boolean') return 'boolean';

  if (Array.isArray(value)) {
    if (value.length === 0) return 'unknown[]';
    // Use the first element to infer array item type
    const itemName = singularize(name);
    const itemType = inferType(value[0], itemName, interfaces, depth);
    return `${itemType}[]`;
  }

  if (typeof value === 'object') {
    const interfaceName = pascalCase(name);
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj);

    if (keys.length === 0) return 'Record<string, unknown>';

    const lines: string[] = [];
    for (const key of keys) {
      const propType = inferType(obj[key], key, interfaces, depth + 1);
      const safeKey = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key) ? key : `'${key}'`;
      lines.push(`  ${safeKey}: ${propType};`);
    }

    const definition = `export interface ${interfaceName} {\n${lines.join('\n')}\n}`;
    interfaces.set(interfaceName, definition);
    return interfaceName;
  }

  return 'unknown';
}

function generate(request: CodegenRequest): string {
  // Try to parse the response body from the request body (for codegen, we use the body content as sample)
  // But since this generates types from response, we work with the body as a sample JSON
  let json: unknown;
  const content = request.body.content;

  if (!content || !content.trim()) {
    return '// Paste a JSON response body into the request body to generate TypeScript types\n// Or run a request first and use the response body';
  }

  try {
    json = JSON.parse(content);
  } catch {
    return '// Could not parse body as JSON\n// Ensure the body contains valid JSON to generate types';
  }

  const rootName = inferRootName(request.url) || 'Root';
  const interfaces = new Map<string, string>();

  if (Array.isArray(json)) {
    if (json.length === 0) {
      return `export type ${rootName}Response = unknown[];`;
    }
    const itemName = singularize(rootName);
    const itemType = inferType(json[0], itemName, interfaces, 0);
    // Add the root type alias
    const parts: string[] = [];
    // Add nested interfaces first (depth-first)
    for (const [, def] of interfaces) {
      parts.push(def);
    }
    parts.push(`export type ${rootName}Response = ${itemType}[];`);
    return parts.join('\n\n');
  }

  const rootType = inferType(json, rootName, interfaces, 0);

  if (interfaces.size === 0) {
    return `export type ${rootName}Response = ${rootType};`;
  }

  // Collect all interfaces, root last
  const parts: string[] = [];
  const rootDef = interfaces.get(rootType);

  for (const [name, def] of interfaces) {
    if (name !== rootType) parts.push(def);
  }
  if (rootDef) parts.push(rootDef);

  return parts.join('\n\n');
}

export const target: CodegenTarget = {
  id: 'typescript-types',
  label: 'TypeScript Types',
  language: 'typescript',
  generate,
};
