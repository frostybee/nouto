/**
 * Generate type definitions from JSON values for multiple languages.
 */

export type TargetLanguage = 'typescript' | 'rust' | 'go' | 'python' | 'json-schema';

export function generateTypes(value: any, language: TargetLanguage, rootName = 'Root'): string {
  switch (language) {
    case 'typescript': return generateTypeScript(value, rootName);
    case 'rust': return generateRust(value, rootName);
    case 'go': return generateGo(value, rootName);
    case 'python': return generatePython(value, rootName);
    case 'json-schema': return generateJsonSchema(value);
  }
}

// ---- TypeScript ----

function generateTypeScript(value: any, name: string, indent = 0): string {
  const pad = '  '.repeat(indent);

  if (Array.isArray(value)) {
    if (value.length === 0) return `${pad}type ${name} = any[];`;
    const itemType = inferTsType(value[0], `${name}Item`);
    if (typeof value[0] === 'object' && value[0] !== null && !Array.isArray(value[0])) {
      return `${generateTypeScript(value[0], `${name}Item`, indent)}\n\n${pad}type ${name} = ${name}Item[];`;
    }
    return `${pad}type ${name} = ${itemType}[];`;
  }

  if (value !== null && typeof value === 'object') {
    const lines = [`${pad}interface ${name} {`];
    for (const [key, val] of Object.entries(value)) {
      const safeKey = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key) ? key : `"${key}"`;
      const nullable = val === null;
      const tsType = nullable ? 'any | null' : inferTsType(val, pascalCase(key));
      lines.push(`${pad}  ${safeKey}: ${tsType};`);
    }
    lines.push(`${pad}}`);

    // Generate nested interfaces
    const nested: string[] = [];
    for (const [key, val] of Object.entries(value)) {
      if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
        nested.push(generateTypeScript(val, pascalCase(key), indent));
      } else if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'object' && val[0] !== null && !Array.isArray(val[0])) {
        nested.push(generateTypeScript(val[0], `${pascalCase(key)}Item`, indent));
      }
    }

    return [...nested, lines.join('\n')].join('\n\n');
  }

  return `${pad}type ${name} = ${inferTsType(value, name)};`;
}

function inferTsType(value: any, _name: string): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) {
    if (value.length === 0) return 'any[]';
    return `${inferTsType(value[0], `${_name}Item`)}[]`;
  }
  if (typeof value === 'object') return _name;
  return typeof value;
}

// ---- Rust ----

function generateRust(value: any, name: string, indent = 0): string {
  const pad = '  '.repeat(indent);

  if (Array.isArray(value)) {
    if (value.length === 0) return `${pad}type ${name} = Vec<serde_json::Value>;`;
    if (typeof value[0] === 'object' && value[0] !== null && !Array.isArray(value[0])) {
      return `${generateRust(value[0], `${name}Item`, indent)}\n\n${pad}type ${name} = Vec<${name}Item>;`;
    }
    return `${pad}type ${name} = Vec<${inferRustType(value[0], `${name}Item`)}>;`;
  }

  if (value !== null && typeof value === 'object') {
    const lines = [
      `${pad}#[derive(Debug, Serialize, Deserialize)]`,
      `${pad}pub struct ${name} {`,
    ];
    for (const [key, val] of Object.entries(value)) {
      const snakeKey = toSnakeCase(key);
      const rustType = val === null ? 'Option<serde_json::Value>' : inferRustType(val, pascalCase(key));
      if (snakeKey !== key) {
        lines.push(`${pad}    #[serde(rename = "${key}")]`);
      }
      lines.push(`${pad}    pub ${snakeKey}: ${rustType},`);
    }
    lines.push(`${pad}}`);

    const nested: string[] = [];
    for (const [key, val] of Object.entries(value)) {
      if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
        nested.push(generateRust(val, pascalCase(key), indent));
      } else if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'object' && val[0] !== null) {
        nested.push(generateRust(val[0], `${pascalCase(key)}Item`, indent));
      }
    }

    return [...nested, lines.join('\n')].join('\n\n');
  }

  return `${pad}type ${name} = ${inferRustType(value, name)};`;
}

function inferRustType(value: any, name: string): string {
  if (value === null) return 'Option<serde_json::Value>';
  if (Array.isArray(value)) {
    if (value.length === 0) return 'Vec<serde_json::Value>';
    return `Vec<${inferRustType(value[0], `${name}Item`)}>`;
  }
  if (typeof value === 'object') return name;
  if (typeof value === 'string') return 'String';
  if (typeof value === 'number') return Number.isInteger(value) ? 'i64' : 'f64';
  if (typeof value === 'boolean') return 'bool';
  return 'serde_json::Value';
}

// ---- Go ----

function generateGo(value: any, name: string, indent = 0): string {
  const pad = '\t'.repeat(indent);

  if (Array.isArray(value)) {
    if (value.length === 0) return `${pad}type ${name} []interface{}`;
    if (typeof value[0] === 'object' && value[0] !== null && !Array.isArray(value[0])) {
      return `${generateGo(value[0], `${name}Item`, indent)}\n\n${pad}type ${name} []${name}Item`;
    }
    return `${pad}type ${name} []${inferGoType(value[0], `${name}Item`)}`;
  }

  if (value !== null && typeof value === 'object') {
    const lines = [`${pad}type ${name} struct {`];
    for (const [key, val] of Object.entries(value)) {
      const goKey = pascalCase(key);
      const goType = val === null ? 'interface{}' : inferGoType(val, pascalCase(key));
      lines.push(`${pad}\t${goKey} ${goType} \`json:"${key}"\``);
    }
    lines.push(`${pad}}`);

    const nested: string[] = [];
    for (const [key, val] of Object.entries(value)) {
      if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
        nested.push(generateGo(val, pascalCase(key), indent));
      } else if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'object' && val[0] !== null) {
        nested.push(generateGo(val[0], `${pascalCase(key)}Item`, indent));
      }
    }

    return [...nested, lines.join('\n')].join('\n\n');
  }

  return `${pad}type ${name} ${inferGoType(value, name)}`;
}

function inferGoType(value: any, name: string): string {
  if (value === null) return 'interface{}';
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]interface{}';
    return `[]${inferGoType(value[0], `${name}Item`)}`;
  }
  if (typeof value === 'object') return name;
  if (typeof value === 'string') return 'string';
  if (typeof value === 'number') return Number.isInteger(value) ? 'int' : 'float64';
  if (typeof value === 'boolean') return 'bool';
  return 'interface{}';
}

// ---- Python ----

function generatePython(value: any, name: string, indent = 0): string {
  const pad = '    '.repeat(indent);

  if (Array.isArray(value)) {
    if (value.length === 0) return `${pad}${name} = list[Any]`;
    if (typeof value[0] === 'object' && value[0] !== null && !Array.isArray(value[0])) {
      return `${generatePython(value[0], `${name}Item`, indent)}\n\n${pad}${name} = list[${name}Item]`;
    }
    return `${pad}${name} = list[${inferPyType(value[0], `${name}Item`)}]`;
  }

  if (value !== null && typeof value === 'object') {
    const lines = [
      `${pad}@dataclass`,
      `${pad}class ${name}:`,
    ];
    for (const [key, val] of Object.entries(value)) {
      const pyKey = toSnakeCase(key);
      const pyType = val === null ? 'Any | None' : inferPyType(val, pascalCase(key));
      lines.push(`${pad}    ${pyKey}: ${pyType}`);
    }

    const nested: string[] = [];
    for (const [key, val] of Object.entries(value)) {
      if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
        nested.push(generatePython(val, pascalCase(key), indent));
      } else if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'object' && val[0] !== null) {
        nested.push(generatePython(val[0], `${pascalCase(key)}Item`, indent));
      }
    }

    return [...nested, lines.join('\n')].join('\n\n');
  }

  return `${pad}${name} = ${inferPyType(value, name)}`;
}

function inferPyType(value: any, name: string): string {
  if (value === null) return 'None';
  if (Array.isArray(value)) {
    if (value.length === 0) return 'list[Any]';
    return `list[${inferPyType(value[0], `${name}Item`)}]`;
  }
  if (typeof value === 'object') return name;
  if (typeof value === 'string') return 'str';
  if (typeof value === 'number') return Number.isInteger(value) ? 'int' : 'float';
  if (typeof value === 'boolean') return 'bool';
  return 'Any';
}

// ---- JSON Schema ----

function generateJsonSchema(value: any): string {
  const schema = inferSchema(value);
  return JSON.stringify(schema, null, 2);
}

function inferSchema(value: any): any {
  if (value === null) return { type: 'null' };
  if (Array.isArray(value)) {
    if (value.length === 0) return { type: 'array', items: {} };
    return { type: 'array', items: inferSchema(value[0]) };
  }
  if (typeof value === 'object') {
    const properties: Record<string, any> = {};
    const required: string[] = [];
    for (const [key, val] of Object.entries(value)) {
      properties[key] = inferSchema(val);
      if (val !== null && val !== undefined) required.push(key);
    }
    return { type: 'object', properties, required };
  }
  if (typeof value === 'string') return { type: 'string' };
  if (typeof value === 'number') return Number.isInteger(value) ? { type: 'integer' } : { type: 'number' };
  if (typeof value === 'boolean') return { type: 'boolean' };
  return {};
}

// ---- Utilities ----

function pascalCase(str: string): string {
  return str.replace(/(^|[_\s-])([a-z])/g, (_, _sep, c) => c.toUpperCase())
    .replace(/[^a-zA-Z0-9]/g, '');
}

function toSnakeCase(str: string): string {
  return str
    .replace(/([A-Z])/g, '_$1')
    .replace(/[-\s]+/g, '_')
    .replace(/^_/, '')
    .toLowerCase();
}
