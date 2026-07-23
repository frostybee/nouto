import {
  buildJsonPointer,
  getAdditionalOperations,
  OPENAPI_OPERATION_METHODS,
} from '@nouto/core/services';
import type { OpenApiAnalysis, OpenApiOperationSummary } from '@nouto/core/services';
import type { OutlineBuildResult, OutlineNode } from './nodes';

/**
 * Codicon per components.* section item. Mirrors the SymbolKind mapping in
 * OpenApiSymbolProvider so both outlines agree on the section list and its
 * visual language.
 */
const COMPONENT_ICONS: Record<string, string> = {
  schemas: 'symbol-class',
  responses: 'symbol-object',
  parameters: 'symbol-variable',
  examples: 'symbol-object',
  requestBodies: 'symbol-object',
  headers: 'symbol-field',
  securitySchemes: 'symbol-interface',
  links: 'symbol-object',
  callbacks: 'symbol-event',
  pathItems: 'folder',
};

const COMPONENT_SECTIONS = Object.keys(COMPONENT_ICONS);

/**
 * Method dot colors, matching Nouto's method badge scheme (TabBar.svelte's
 * methodColor): GET green, POST yellow, PUT blue, PATCH orange, DELETE red,
 * HEAD purple. Unknown methods fall back to an uncolored dot.
 */
const METHOD_COLORS: Record<string, string> = {
  get: 'charts.green',
  post: 'charts.yellow',
  put: 'charts.blue',
  patch: 'charts.orange',
  delete: 'charts.red',
  head: 'charts.purple',
};

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function operationDetail(value: unknown): string | undefined {
  const operation = asRecord(value);
  if (!operation) return undefined;
  return typeof operation.summary === 'string'
    ? operation.summary
    : typeof operation.operationId === 'string'
      ? operation.operationId
      : undefined;
}

interface NodeProps {
  label: string;
  description?: string;
  tooltip?: string;
  iconId: string;
  iconColor?: string;
  contextValue?: string;
  pointer?: string;
}

/**
 * Builds the outline node tree for the OpenAPI Outline view. Pure with respect
 * to VS Code: takes the document's URI string and its cached analysis, returns
 * plain nodes plus a pointer index for cursor-position sync. Top-level groups
 * (Servers, Security, Tags, Paths, Components, Webhooks) always render — even
 * when their spec key is absent — so their context-menu Add actions stay
 * reachable; groups for absent keys simply carry no pointer.
 */
export function buildOutlineTree(
  documentUri: string,
  analysis: OpenApiAnalysis
): OutlineBuildResult {
  const roots: OutlineNode[] = [];
  const pointerIndex = new Map<string, OutlineNode>();
  const spec = asRecord(analysis.parsedSpec);
  if (!spec) return { roots, pointerIndex };

  const node = (parent: OutlineNode | undefined, key: string, props: NodeProps): OutlineNode => {
    // The `pointer` token lets one menu entry (Copy JSON Pointer) target every
    // pointer-bearing node via `viewItem =~ /\bpointer\b/`.
    const contextValue = props.pointer !== undefined
      ? (props.contextValue ? `${props.contextValue} pointer` : 'pointer')
      : props.contextValue;
    const created: OutlineNode = {
      id: parent ? `${parent.id}/${key}` : key,
      documentUri,
      children: [],
      parent,
      ...props,
      contextValue,
    };
    parent?.children.push(created);
    if (created.pointer !== undefined) pointerIndex.set(created.pointer, created);
    return created;
  };

  const operationNode = (parent: OutlineNode, operation: OpenApiOperationSummary): OutlineNode => {
    const created = node(parent, operation.pointer, {
      label: `${operation.method.toUpperCase()} ${operation.path}`,
      description: operation.summary ?? operation.operationId,
      iconId: 'circle-filled',
      iconColor: METHOD_COLORS[operation.method.toLowerCase()],
      contextValue: 'outlineOperation',
      pointer: operation.pointer,
    });
    created.operation = { path: operation.path, method: operation.method };
    return created;
  };

  // --- General ---
  const info = asRecord(spec.info);
  if (info) {
    const title = typeof info.title === 'string' && info.title ? info.title : 'General';
    const version = typeof info.version === 'string' && info.version ? `v${info.version}` : undefined;
    roots.push(node(undefined, 'general', {
      label: title,
      description: version,
      tooltip: 'General API metadata (info)',
      iconId: 'info',
      contextValue: 'outlineInfo',
      pointer: buildJsonPointer(['info']),
    }));
  }

  // --- Servers ---
  const servers = Array.isArray(spec.servers) ? spec.servers : [];
  {
    const group = node(undefined, 'servers', {
      label: 'Servers',
      iconId: 'server-environment',
      contextValue: 'outlineServersGroup',
      pointer: Array.isArray(spec.servers) ? buildJsonPointer(['servers']) : undefined,
    });
    servers.forEach((raw, index) => {
      const server = asRecord(raw);
      node(group, String(index), {
        label: typeof server?.url === 'string' && server.url ? server.url : `Server ${index + 1}`,
        description: typeof server?.description === 'string' ? server.description : undefined,
        iconId: 'server',
        contextValue: 'outlineServer',
        pointer: buildJsonPointer(['servers', String(index)]),
      });
    });
    roots.push(group);
  }

  // --- Security (global requirements; scheme definitions live under Components) ---
  const security = Array.isArray(spec.security) ? spec.security : [];
  {
    const group = node(undefined, 'security', {
      label: 'Security',
      tooltip: 'Global security requirements. Scheme definitions are under Components > securitySchemes.',
      iconId: 'shield',
      contextValue: 'outlineSecurityGroup',
      pointer: Array.isArray(spec.security) ? buildJsonPointer(['security']) : undefined,
    });
    security.forEach((raw, index) => {
      const requirement = asRecord(raw);
      const names = requirement ? Object.keys(requirement) : [];
      node(group, String(index), {
        label: names.length ? names.join(' + ') : 'None (optional)',
        iconId: 'key',
        contextValue: 'outlineSecurityRequirement',
        pointer: buildJsonPointer(['security', String(index)]),
      });
    });
    roots.push(group);
  }

  // --- Tags (declared tags first, in order; undeclared tags from operations after) ---
  const declaredTags = Array.isArray(spec.tags) ? spec.tags : [];
  const declaredIndex = new Map<string, number>();
  declaredTags.forEach((raw, index) => {
    const name = asRecord(raw)?.name;
    if (typeof name === 'string' && name && !declaredIndex.has(name)) declaredIndex.set(name, index);
  });
  const operationsByTag = new Map<string, OpenApiOperationSummary[]>();
  const untagged: OpenApiOperationSummary[] = [];
  for (const operation of analysis.operations) {
    if (!operation.tags.length) {
      untagged.push(operation);
      continue;
    }
    for (const tag of operation.tags) {
      const list = operationsByTag.get(tag) ?? [];
      list.push(operation);
      operationsByTag.set(tag, list);
    }
  }
  const tagNames = [...declaredIndex.keys()];
  for (const name of operationsByTag.keys()) {
    if (!declaredIndex.has(name)) tagNames.push(name);
  }
  {
    const group = node(undefined, 'tags', {
      label: 'Tags',
      iconId: 'tags',
      contextValue: 'outlineTagsGroup',
      pointer: Array.isArray(spec.tags) ? buildJsonPointer(['tags']) : undefined,
    });
    for (const name of tagNames) {
      const index = declaredIndex.get(name);
      const tagNode = node(group, `tag:${name}`, {
        label: name,
        iconId: 'tag',
        // Fallback tags (used by operations but not declared) have no spec
        // location: no pointer, no contextValue, no menu items.
        contextValue: index === undefined ? undefined : 'outlineTag',
        pointer: index === undefined ? undefined : buildJsonPointer(['tags', String(index)]),
      });
      for (const operation of operationsByTag.get(name) ?? []) operationNode(tagNode, operation);
    }
    if (untagged.length) {
      const untaggedNode = node(group, 'untagged', { label: 'Untagged', iconId: 'tag' });
      for (const operation of untagged) operationNode(untaggedNode, operation);
    }
    roots.push(group);
  }

  // --- Operation ID (flat, alphabetical; operations without an id are skipped) ---
  const withOperationId = analysis.operations
    .filter((operation) => typeof operation.operationId === 'string' && operation.operationId.length > 0)
    .sort((a, b) => a.operationId!.localeCompare(b.operationId!));
  if (withOperationId.length) {
    const group = node(undefined, 'operationId', { label: 'Operation ID', iconId: 'symbol-misc' });
    for (const operation of withOperationId) {
      const created = node(group, operation.pointer, {
        label: operation.operationId!,
        description: `${operation.method.toUpperCase()} ${operation.path}`,
        iconId: 'circle-filled',
        iconColor: METHOD_COLORS[operation.method.toLowerCase()],
        contextValue: 'outlineOperation',
        pointer: operation.pointer,
      });
      created.operation = { path: operation.path, method: operation.method };
    }
    roots.push(group);
  }

  // --- Paths (built after Tags/Operation ID so the pointer index favors these copies) ---
  const paths = asRecord(spec.paths);
  {
    const group = node(undefined, 'paths', {
      label: 'Paths',
      iconId: 'list-tree',
      contextValue: 'outlinePathsGroup',
      pointer: paths ? buildJsonPointer(['paths']) : undefined,
    });
    const byPath = new Map<string, OpenApiOperationSummary[]>();
    for (const operation of analysis.operations) {
      const list = byPath.get(operation.path) ?? [];
      list.push(operation);
      byPath.set(operation.path, list);
    }
    for (const path of Object.keys(paths ?? {})) {
      const operations = byPath.get(path) ?? [];
      const pathNode = node(group, path, {
        label: path,
        description: `${operations.length} operation${operations.length === 1 ? '' : 's'}`,
        iconId: 'folder',
        contextValue: 'outlinePath',
        pointer: buildJsonPointer(['paths', path]),
      });
      pathNode.path = path;
      for (const operation of operations) operationNode(pathNode, operation);
    }
    roots.push(group);
  }

  // --- Components ---
  const components = asRecord(spec.components);
  {
    const group = node(undefined, 'components', {
      label: 'Components',
      iconId: 'library',
      contextValue: 'outlineComponentsGroup',
      pointer: components ? buildJsonPointer(['components']) : undefined,
    });
    for (const section of COMPONENT_SECTIONS) {
      const values = asRecord(components?.[section]);
      if (!values) continue;
      const sectionNode = node(group, section, {
        label: section,
        iconId: 'folder',
        contextValue: section === 'securitySchemes'
          ? 'outlineComponentSection outlineSecuritySchemesSection'
          : 'outlineComponentSection',
        pointer: buildJsonPointer(['components', section]),
      });
      sectionNode.component = { section };
      for (const name of Object.keys(values)) {
        const itemNode = node(sectionNode, name, {
          label: name,
          iconId: COMPONENT_ICONS[section],
          contextValue: 'outlineComponentItem',
          pointer: buildJsonPointer(['components', section, name]),
        });
        itemNode.component = { section, name };
      }
    }
    roots.push(group);
  }

  // --- Webhooks (3.1+) ---
  if (analysis.version !== undefined && analysis.version !== '3.0') {
    const webhooks = asRecord(spec.webhooks);
    const group = node(undefined, 'webhooks', {
      label: 'Webhooks',
      iconId: 'symbol-event',
      contextValue: 'outlineWebhooksGroup',
      pointer: webhooks ? buildJsonPointer(['webhooks']) : undefined,
    });
    for (const [name, value] of Object.entries(webhooks ?? {})) {
      const pathItem = asRecord(value);
      if (!pathItem) continue;
      const fixedMethods = OPENAPI_OPERATION_METHODS.filter((method) => asRecord(pathItem[method]));
      const additionalEntries = Object.entries(getAdditionalOperations(pathItem) ?? {})
        .filter(([, operation]) => asRecord(operation));
      const webhookNode = node(group, name, {
        label: name,
        iconId: 'folder',
        contextValue: 'outlineWebhook',
        pointer: buildJsonPointer(['webhooks', name]),
      });
      webhookNode.path = name;
      for (const method of fixedMethods) {
        node(webhookNode, method, {
          label: `${method.toUpperCase()} ${name}`,
          description: operationDetail(pathItem[method]),
          iconId: 'circle-filled',
          iconColor: METHOD_COLORS[method.toLowerCase()],
          contextValue: 'outlineWebhookOperation',
          pointer: buildJsonPointer(['webhooks', name, method]),
        });
      }
      for (const [method, operation] of additionalEntries) {
        node(webhookNode, `additional:${method}`, {
          label: `${method.toUpperCase()} ${name}`,
          description: operationDetail(operation),
          iconId: 'circle-filled',
          iconColor: METHOD_COLORS[method.toLowerCase()],
          contextValue: 'outlineWebhookOperation',
          pointer: buildJsonPointer(['webhooks', name, 'additionalOperations', method]),
        });
      }
    }
    roots.push(group);
  }

  return { roots, pointerIndex };
}
