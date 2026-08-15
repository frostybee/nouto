/**
 * Parameter/body conversion for the importer: OpenAPI parameters to key-value
 * rows, request bodies to Nouto body states, and example generation from
 * schemas (with recursive-schema protection).
 */
import type { BodyState, KeyValue, PathParam } from '../../../types';
import { generateId } from '../../../types';
import { isRefNode, resolveNode } from '../refs';
import type { OpenApiParameter, OpenApiRequestBody, OpenApiSpec } from './specTypes';

/**
 * Resolves a possible Reference Object, collecting any resolution problems
 * (missing target, cycle, unsupported external reference) as human-readable
 * warnings. On failure the original node is returned, matching the
 * degrade-not-throw behavior of the previous naive resolver.
 */
export function resolveRefTracked(obj: any, spec: OpenApiSpec, warnings: string[]): any {
  const { value, diagnostics } = resolveNode(obj, spec);
  for (const diagnostic of diagnostics) {
    warnings.push(diagnostic.message);
  }
  return value;
}

/**
 * Builds Path-tab rows for a literal `{param}` path template: one row per
 * declared `in: 'path'` parameter (with example/default value and
 * description), plus empty rows for placeholders present in the template but
 * never declared, so the tab always mirrors the URL.
 */
export function buildPathParams(path: string, params: unknown[]): PathParam[] {
  const rows: PathParam[] = [];
  for (const raw of params) {
    if (!raw || typeof raw !== 'object') continue;
    const param = raw as OpenApiParameter;
    if (param.in !== 'path' || !param.name) continue;
    const value = param.example !== undefined
      ? String(param.example)
      : param.schema?.default !== undefined
        ? String(param.schema.default)
        : '';
    rows.push({
      id: generateId(),
      key: param.name,
      value,
      description: param.description || '',
      enabled: true,
    });
  }
  for (const match of path.matchAll(/\{(\w+)\}/g)) {
    if (!rows.some(row => row.key === match[1])) {
      rows.push({ id: generateId(), key: match[1], value: '', description: '', enabled: true });
    }
  }
  return rows;
}

export function convertParameters(params: OpenApiParameter[]): {
  queryParams: KeyValue[];
  headerParams: KeyValue[];
} {
  const queryParams: KeyValue[] = [];
  const headerParams: KeyValue[] = [];

  for (const param of params) {
    const value = param.example !== undefined
      ? String(param.example)
      : param.schema?.default !== undefined
        ? String(param.schema.default)
        : '';

    const kv: KeyValue = {
      id: generateId(),
      key: param.name,
      value,
      enabled: param.required !== false,
    };

    if (param.in === 'query') {
      queryParams.push(kv);
    } else if (param.in === 'header') {
      headerParams.push(kv);
    }
  }

  return { queryParams, headerParams };
}

export function convertRequestBody(body: OpenApiRequestBody, spec: OpenApiSpec, warnings: string[]): BodyState {
  if (!body || !body.content) {
    return { type: 'none', content: '' };
  }

  const contentTypes = Object.keys(body.content);

  if (body.content['application/json']) {
    const media = body.content['application/json'];
    const example = extractExample(media, spec, warnings);
    return {
      type: 'json',
      content: example ? JSON.stringify(example, null, 2) : '{}',
    };
  }

  if (body.content['application/graphql'] || body.content['application/graphql+json']) {
    return { type: 'graphql', content: '' };
  }

  if (body.content['multipart/form-data']) {
    const media = body.content['multipart/form-data'];
    const formItems = schemaToFormData(media.schema, spec, warnings);
    return {
      type: 'form-data',
      content: JSON.stringify(formItems),
    };
  }

  if (body.content['application/x-www-form-urlencoded']) {
    const media = body.content['application/x-www-form-urlencoded'];
    const formItems = schemaToFormData(media.schema, spec, warnings);
    return {
      type: 'x-www-form-urlencoded',
      content: JSON.stringify(formItems),
    };
  }

  if (body.content['text/plain']) {
    const media = body.content['text/plain'];
    const example = extractExample(media, spec, warnings);
    return {
      type: 'text',
      content: example ? String(example) : '',
    };
  }

  const firstType = contentTypes[0];
  if (firstType) {
    const media = body.content[firstType];
    const example = extractExample(media, spec, warnings);
    if (firstType.includes('json')) {
      return {
        type: 'json',
        content: example ? JSON.stringify(example, null, 2) : '{}',
      };
    }
    return {
      type: 'text',
      content: example ? String(example) : '',
    };
  }

  return { type: 'none', content: '' };
}

function schemaToFormData(
  schema: any,
  spec: OpenApiSpec,
  warnings: string[]
): Array<{ key: string; value: string; enabled: boolean; fieldType: string }> {
  const resolved = resolveRefTracked(schema, spec, warnings);
  if (!resolved || !resolved.properties) return [];
  const required = new Set(resolved.required || []);
  return Object.entries(resolved.properties).map(([key, rawProp]: [string, any]) => {
    const prop = resolveRefTracked(rawProp, spec, warnings);
    return {
      key,
      value: prop.example !== undefined ? String(prop.example) : prop.default !== undefined ? String(prop.default) : '',
      enabled: required.has(key),
      fieldType: prop.format === 'binary' ? 'file' : 'text',
    };
  });
}

function extractExample(
  media: { schema?: any; example?: any; examples?: Record<string, { value: any }> },
  spec: OpenApiSpec,
  warnings: string[]
): any {
  if (media.example !== undefined) return media.example;
  if (media.examples) {
    const firstExample = Object.values(media.examples)[0];
    if (firstExample?.value !== undefined) return firstExample.value;
  }
  if (media.schema) {
    return generateExampleFromSchema(media.schema, spec, warnings, new Set());
  }
  return undefined;
}

/**
 * `visitedRefs` guards THIS recursion against recursive schemas (e.g.
 * TreeNode.children → TreeNode): each individual $ref resolves cleanly, so
 * resolveNode's single-chain cycle detection never fires — the loop only
 * exists across the property/items recursion. A revisited $ref yields
 * `undefined` (the property is omitted), which is expected for recursive
 * schemas, not an authoring error — so no warning.
 */
function generateExampleFromSchema(
  schema: any,
  spec: OpenApiSpec,
  warnings: string[],
  visitedRefs: Set<string>
): any {
  if (!schema) return undefined;
  if (isRefNode(schema)) {
    if (visitedRefs.has(schema.$ref)) return undefined;
    const resolved = resolveRefTracked(schema, spec, warnings);
    if (resolved === schema) return undefined; // resolution failed; warning already pushed
    return generateExampleFromSchema(resolved, spec, warnings, new Set(visitedRefs).add(schema.$ref));
  }
  if (schema.example !== undefined) return schema.example;
  if (schema.default !== undefined) return schema.default;

  switch (schema.type) {
    case 'object': {
      if (!schema.properties) return {};
      const obj: Record<string, any> = {};
      for (const [key, prop] of Object.entries(schema.properties) as [string, any][]) {
        obj[key] = generateExampleFromSchema(prop, spec, warnings, visitedRefs);
      }
      return obj;
    }
    case 'array': {
      const itemExample = schema.items
        ? generateExampleFromSchema(schema.items, spec, warnings, visitedRefs)
        : null;
      return itemExample !== undefined ? [itemExample] : [];
    }
    case 'string':
      if (schema.enum && schema.enum.length > 0) return schema.enum[0];
      return '';
    case 'integer':
    case 'number':
      return 0;
    case 'boolean':
      return false;
    default:
      return undefined;
  }
}
