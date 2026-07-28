import {
  buildJsonPointer,
  getAdditionalOperations,
  OPENAPI_OPERATION_METHODS,
} from '@nouto/core/services';
import type {
  ExternalAnalysisResult,
  ExternalRefEntry,
  OpenApiAnalysis,
  OpenApiOperationSummary,
} from '@nouto/core/services';
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

/** Options controlling how the outline orders each group's children. */
export interface BuildOutlineOptions {
  /**
   * Sort Paths, Tags, Components items, Servers, and Webhooks alphabetically
   * instead of in document order. Operations within a path/tag stay in
   * document order regardless; the Operation ID group is always alphabetical.
   */
  sortAlphabetically?: boolean;
}

/** Returns `values` sorted case-insensitively, or as-is when sorting is off. */
function ordered(values: string[], sortAlphabetically: boolean): string[] {
  return sortAlphabetically
    ? [...values].sort((a, b) => a.localeCompare(b))
    : values;
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
  /** Overrides the root document URI for nodes that point into another file. */
  documentUri?: string;
  /**
   * Marks a node whose `pointer` belongs to a DIFFERENT document. External
   * nodes stay out of `pointerIndex`, which maps pointers of the current
   * document for cursor-position sync and programmatic reveal.
   */
  external?: boolean;
}

/**
 * Path of `targetUri` relative to the directory of `fromDocumentUri`, for
 * display. Falls back to the target's basename when the URIs share no common
 * root (different scheme/host).
 */
export function relativeLabel(fromDocumentUri: string, targetUri: string): string {
  const fromParts = fromDocumentUri.split('/');
  fromParts.pop();
  const targetParts = targetUri.split('/');
  let common = 0;
  while (
    common < fromParts.length &&
    common < targetParts.length - 1 &&
    fromParts[common] === targetParts[common]
  ) {
    common += 1;
  }
  if (common === 0) return targetParts[targetParts.length - 1] || targetUri;
  const ups = fromParts.length - common;
  return '../'.repeat(ups) + targetParts.slice(common).join('/');
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
  analysis: OpenApiAnalysis,
  options?: BuildOutlineOptions,
  external?: ExternalAnalysisResult
): OutlineBuildResult {
  const roots: OutlineNode[] = [];
  const pointerIndex = new Map<string, OutlineNode>();
  const sortAlphabetically = options?.sortAlphabetically ?? false;
  const spec = asRecord(analysis.parsedSpec);
  if (!spec) return { roots, pointerIndex };

  const node = (parent: OutlineNode | undefined, key: string, props: NodeProps): OutlineNode => {
    const { external: isExternal, ...rest } = props;
    // The `pointer` token lets one menu entry (Copy JSON Pointer) target every
    // pointer-bearing node via `viewItem =~ /\bpointer\b/`.
    const contextValue = rest.pointer !== undefined
      ? (rest.contextValue ? `${rest.contextValue} pointer` : 'pointer')
      : rest.contextValue;
    const created: OutlineNode = {
      id: parent ? `${parent.id}/${key}` : key,
      documentUri,
      children: [],
      parent,
      ...rest,
      contextValue,
    };
    parent?.children.push(created);
    if (created.pointer !== undefined && !isExternal) pointerIndex.set(created.pointer, created);
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

  /**
   * Label for one entry of an operation's `parameters` array. Inline parameters
   * show their name and location (`page` · query); `$ref` entries are not
   * resolved here, so they fall back to the target's final pointer segment,
   * which for the conventional `#/components/parameters/Page` reads correctly.
   */
  const parameterEntry = (raw: unknown, index: number): { label: string; description?: string } => {
    const parameter = asRecord(raw);
    if (typeof parameter?.name === 'string' && parameter.name) {
      return {
        label: parameter.name,
        description: typeof parameter.in === 'string' ? parameter.in : undefined,
      };
    }
    const ref = typeof parameter?.$ref === 'string' ? parameter.$ref : undefined;
    if (ref) return { label: ref.split('/').pop() || ref, description: '$ref' };
    return { label: `Parameter ${index + 1}` };
  };

  /**
   * Nests an operation's own surface — parameters, request body, responses,
   * callbacks, security, servers, tags — beneath its node, so the outline can
   * be drilled into rather than dead-ending at the operation.
   *
   * Only applied where an operation is a genuine document location (Paths and
   * Webhooks). Tags and Operation ID are flat indexes over those same
   * operations, so repeating the subtree there would triple it for no
   * navigational gain. Children stay in document order regardless of the sort
   * toggle — response codes and parameter order carry meaning, and the toggle's
   * contract covers only the top-level groups.
   */
  const addOperationDetail = (
    parent: OutlineNode,
    operation: Record<string, unknown>,
    basePointer: string
  ): void => {
    const section = (key: string, iconId: string): OutlineNode =>
      node(parent, key, {
        label: key,
        iconId,
        contextValue: 'outlineOperationSection',
        pointer: basePointer + buildJsonPointer([key]),
      });
    const entry = (
      group: OutlineNode,
      key: string,
      childKey: string,
      props: { label: string; description?: string; iconId: string }
    ): void => {
      node(group, childKey, {
        ...props,
        contextValue: 'outlineOperationItem',
        pointer: basePointer + buildJsonPointer([key, childKey]),
      });
    };

    const parameters = Array.isArray(operation.parameters) ? operation.parameters : [];
    if (parameters.length) {
      const group = section('parameters', 'symbol-parameter');
      parameters.forEach((raw, index) => {
        entry(group, 'parameters', String(index), {
          ...parameterEntry(raw, index),
          iconId: 'symbol-variable',
        });
      });
    }

    // A request body has no meaningful children to list, so it stays a leaf.
    if (asRecord(operation.requestBody)) section('requestBody', 'symbol-object');

    const responses = asRecord(operation.responses);
    if (responses) {
      const group = section('responses', 'reply');
      for (const code of Object.keys(responses)) {
        const description = asRecord(responses[code])?.description;
        entry(group, 'responses', code, {
          label: code,
          description: typeof description === 'string' ? description : undefined,
          iconId: 'symbol-numeric',
        });
      }
    }

    const callbacks = asRecord(operation.callbacks);
    if (callbacks && Object.keys(callbacks).length) {
      const group = section('callbacks', 'symbol-event');
      for (const name of Object.keys(callbacks)) {
        entry(group, 'callbacks', name, { label: name, iconId: 'symbol-event' });
      }
    }

    // Mirrors the root Security/Servers/Tags label conventions so the same
    // concept reads identically wherever it appears in the tree.
    const security = Array.isArray(operation.security) ? operation.security : [];
    if (security.length) {
      const group = section('security', 'shield');
      security.forEach((raw, index) => {
        const names = Object.keys(asRecord(raw) ?? {});
        entry(group, 'security', String(index), {
          label: names.length ? names.join(' + ') : 'None (optional)',
          iconId: 'key',
        });
      });
    }

    const servers = Array.isArray(operation.servers) ? operation.servers : [];
    if (servers.length) {
      const group = section('servers', 'server-environment');
      servers.forEach((raw, index) => {
        const server = asRecord(raw);
        entry(group, 'servers', String(index), {
          label: typeof server?.url === 'string' && server.url ? server.url : `Server ${index + 1}`,
          description: typeof server?.description === 'string' ? server.description : undefined,
          iconId: 'server',
        });
      });
    }

    const tags = Array.isArray(operation.tags)
      ? operation.tags.filter((tag): tag is string => typeof tag === 'string')
      : [];
    if (tags.length) {
      const group = section('tags', 'tags');
      tags.forEach((tag, index) => {
        entry(group, 'tags', String(index), { label: tag, iconId: 'tag' });
      });
    }
  };

  // --- General (groups the two root metadata keys: openapi and info) ---
  const info = asRecord(spec.info);
  {
    // Labelled with the API's own title rather than a bare "General": the
    // identity of the spec is worth reading without expanding the node.
    const title = typeof info?.title === 'string' && info.title ? info.title : 'General';
    const version = typeof info?.version === 'string' && info.version ? `v${info.version}` : undefined;
    // Renders even when `info` is absent, like the other top-level groups, so
    // an incomplete spec still shows the slot instead of silently dropping it.
    const group = node(undefined, 'general', {
      label: title,
      description: version,
      tooltip: 'General API metadata (openapi, info)',
      iconId: 'info',
      contextValue: 'outlineInfo',
      pointer: info ? buildJsonPointer(['info']) : undefined,
    });
    if (spec.openapi !== undefined) {
      node(group, 'openapi', {
        label: 'openapi',
        description: typeof spec.openapi === 'string' ? spec.openapi : undefined,
        iconId: 'versions',
        contextValue: 'outlineGeneralItem',
        pointer: buildJsonPointer(['openapi']),
      });
    }
    if (info) {
      node(group, 'info', {
        label: 'info',
        iconId: 'book',
        contextValue: 'outlineGeneralItem',
        pointer: buildJsonPointer(['info']),
      });
    }
    roots.push(group);
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
    const serverEntries = servers.map((raw, index) => {
      const server = asRecord(raw);
      return {
        index,
        label: typeof server?.url === 'string' && server.url ? server.url : `Server ${index + 1}`,
        description: typeof server?.description === 'string' ? server.description : undefined,
      };
    });
    if (sortAlphabetically) serverEntries.sort((a, b) => a.label.localeCompare(b.label));
    for (const entry of serverEntries) {
      node(group, String(entry.index), {
        label: entry.label,
        description: entry.description,
        iconId: 'server',
        contextValue: 'outlineServer',
        pointer: buildJsonPointer(['servers', String(entry.index)]),
      });
    }
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
  // When sorting, order declared and undeclared tags together (the Untagged
  // bucket is appended separately below, so it stays last regardless).
  const orderedTagNames = ordered(tagNames, sortAlphabetically);
  {
    const group = node(undefined, 'tags', {
      label: 'Tags',
      iconId: 'tags',
      contextValue: 'outlineTagsGroup',
      pointer: Array.isArray(spec.tags) ? buildJsonPointer(['tags']) : undefined,
    });
    for (const name of orderedTagNames) {
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
    for (const path of ordered(Object.keys(paths ?? {}), sortAlphabetically)) {
      const operations = byPath.get(path) ?? [];
      const pathNode = node(group, path, {
        label: path,
        description: `${operations.length} operation${operations.length === 1 ? '' : 's'}`,
        iconId: 'folder',
        contextValue: 'outlinePath',
        pointer: buildJsonPointer(['paths', path]),
      });
      pathNode.path = path;
      const pathItem = asRecord(paths?.[path]);
      for (const operation of operations) {
        const created = operationNode(pathNode, operation);
        // `method` is the literal key the summary was indexed by: a fixed verb
        // on the path item, or an entry of the 3.2 additionalOperations map.
        const fixed = asRecord(pathItem?.[operation.method]);
        const raw = fixed
          ?? asRecord(getAdditionalOperations(pathItem ?? {})?.[operation.method]);
        if (raw) addOperationDetail(created, raw, operation.pointer);
      }
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
      for (const name of ordered(Object.keys(values), sortAlphabetically)) {
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
    const webhookEntries = Object.entries(webhooks ?? {});
    if (sortAlphabetically) webhookEntries.sort(([a], [b]) => a.localeCompare(b));
    for (const [name, value] of webhookEntries) {
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
        const pointer = buildJsonPointer(['webhooks', name, method]);
        const created = node(webhookNode, method, {
          label: `${method.toUpperCase()} ${name}`,
          description: operationDetail(pathItem[method]),
          iconId: 'circle-filled',
          iconColor: METHOD_COLORS[method.toLowerCase()],
          contextValue: 'outlineWebhookOperation',
          pointer,
        });
        const raw = asRecord(pathItem[method]);
        if (raw) addOperationDetail(created, raw, pointer);
      }
      for (const [method, operation] of additionalEntries) {
        const pointer = buildJsonPointer(['webhooks', name, 'additionalOperations', method]);
        const created = node(webhookNode, `additional:${method}`, {
          label: `${method.toUpperCase()} ${name}`,
          description: operationDetail(operation),
          iconId: 'circle-filled',
          iconColor: METHOD_COLORS[method.toLowerCase()],
          contextValue: 'outlineWebhookOperation',
          pointer,
        });
        const raw = asRecord(operation);
        if (raw) addOperationDetail(created, raw, pointer);
      }
    }
    roots.push(group);
  }

  // --- Referenced files (external $refs, async second pass) ---
  // Unlike the always-rendered groups above, this one is omitted when empty:
  // it gates no Add actions, so an empty group would be pure clutter.
  if (external && external.externalRefs.size > 0) {
    const group = node(undefined, 'referencedFiles', {
      label: 'Referenced files',
      iconId: 'references',
      contextValue: 'outlineReferencedFilesGroup',
    });
    const byFile = new Map<string, ExternalRefEntry[]>();
    for (const entry of external.externalRefs.values()) {
      const list = byFile.get(entry.targetUri);
      if (list) list.push(entry);
      else byFile.set(entry.targetUri, [entry]);
    }
    const files = [...byFile.entries()];
    if (sortAlphabetically) files.sort(([a], [b]) => a.localeCompare(b));
    for (const [fileUri, entries] of files) {
      const resolved = external.resolvedFiles.has(fileUri);
      const fileNode = node(group, fileUri, {
        label: relativeLabel(documentUri, fileUri),
        description: `${entries.length} ref${entries.length === 1 ? '' : 's'}`,
        tooltip: fileUri,
        iconId: resolved ? 'file' : 'error',
        iconColor: resolved ? undefined : 'errorForeground',
        contextValue: 'outlineReferencedFile',
        documentUri: fileUri,
      });
      // One child per distinct target pointer — the children are navigation
      // targets into the file, not a list of every referencing occurrence.
      const byPointer = new Map<string, ExternalRefEntry>();
      for (const entry of entries) {
        if (!byPointer.has(entry.targetPointer)) byPointer.set(entry.targetPointer, entry);
      }
      for (const [targetPointer, entry] of byPointer) {
        node(fileNode, entry.atPointer, {
          label: targetPointer || '(whole document)',
          description: entry.ref,
          iconId: 'symbol-reference',
          contextValue: 'outlineExternalRef',
          pointer: targetPointer,
          documentUri: fileUri,
          external: true,
        });
      }
    }
    roots.push(group);
  }

  return { roots, pointerIndex };
}
