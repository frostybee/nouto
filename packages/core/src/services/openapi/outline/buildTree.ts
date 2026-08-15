/**
 * Assembles the OpenAPI Outline tree. Pure with respect to any host: takes
 * the document's URI string and its cached analysis, returns plain nodes plus
 * a pointer index for cursor-position sync.
 */
import { buildPointer } from '../pointer';
import { getAdditionalOperations, OPENAPI_OPERATION_METHODS } from '../types';
import type { OpenApiAnalysis, OpenApiOperationSummary } from '../types';
import type { ExternalAnalysisResult, ExternalRefEntry } from '../externalRefs';
import {
  asRecord,
  COMPONENT_ICONS,
  COMPONENT_SECTIONS,
  METHOD_COLORS,
  operationDetail,
  ordered,
  relativeLabel,
} from './model';
import type { BuildOutlineOptions, NodeProps, OutlineBuildResult, OutlineNode } from './model';
import { makeAddOperationDetail, makeOperationNode } from './operations';

/**
 * Builds the outline node tree for the OpenAPI Outline view. Top-level groups
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

  const operationNode = makeOperationNode(node);
  const addOperationDetail = makeAddOperationDetail(node);

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
      pointer: info ? buildPointer(['info']) : undefined,
    });
    if (spec.openapi !== undefined) {
      node(group, 'openapi', {
        label: 'openapi',
        description: typeof spec.openapi === 'string' ? spec.openapi : undefined,
        iconId: 'versions',
        contextValue: 'outlineGeneralItem',
        pointer: buildPointer(['openapi']),
      });
    }
    if (info) {
      node(group, 'info', {
        label: 'info',
        iconId: 'book',
        contextValue: 'outlineGeneralItem',
        pointer: buildPointer(['info']),
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
      pointer: Array.isArray(spec.servers) ? buildPointer(['servers']) : undefined,
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
        pointer: buildPointer(['servers', String(entry.index)]),
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
      pointer: Array.isArray(spec.security) ? buildPointer(['security']) : undefined,
    });
    security.forEach((raw, index) => {
      const requirement = asRecord(raw);
      const names = requirement ? Object.keys(requirement) : [];
      node(group, String(index), {
        label: names.length ? names.join(' + ') : 'None (optional)',
        iconId: 'key',
        contextValue: 'outlineSecurityRequirement',
        pointer: buildPointer(['security', String(index)]),
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
      pointer: Array.isArray(spec.tags) ? buildPointer(['tags']) : undefined,
    });
    for (const name of orderedTagNames) {
      const index = declaredIndex.get(name);
      const tagNode = node(group, `tag:${name}`, {
        label: name,
        iconId: 'tag',
        // Fallback tags (used by operations but not declared) have no spec
        // location: no pointer, no contextValue, no menu items.
        contextValue: index === undefined ? undefined : 'outlineTag',
        pointer: index === undefined ? undefined : buildPointer(['tags', String(index)]),
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
      pointer: paths ? buildPointer(['paths']) : undefined,
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
        pointer: buildPointer(['paths', path]),
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
      pointer: components ? buildPointer(['components']) : undefined,
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
        pointer: buildPointer(['components', section]),
      });
      sectionNode.component = { section };
      for (const name of ordered(Object.keys(values), sortAlphabetically)) {
        const itemNode = node(sectionNode, name, {
          label: name,
          iconId: COMPONENT_ICONS[section],
          contextValue: 'outlineComponentItem',
          pointer: buildPointer(['components', section, name]),
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
      pointer: webhooks ? buildPointer(['webhooks']) : undefined,
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
        pointer: buildPointer(['webhooks', name]),
      });
      webhookNode.path = name;
      for (const method of fixedMethods) {
        const pointer = buildPointer(['webhooks', name, method]);
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
        const pointer = buildPointer(['webhooks', name, 'additionalOperations', method]);
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
