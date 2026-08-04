/**
 * Per-node context-menu table for the OpenAPI outline — the desktop mirror of
 * the VS Code extension's `view/item/context` contributions, with every
 * QuickPick expanded into flat entries (no-dialog decision): unused HTTP
 * methods, security-scheme presets, and component sections each become their
 * own menu row. Pure: the Svelte layer maps entries onto ContextMenu items.
 */
import { getByPointer } from '@nouto/core/services/openapi/pointer';
import type { OutlineNode } from '@nouto/core/services/openapi/outline';
import {
  COMPONENT_PRESETS,
  COMPONENT_TITLES,
  SECURITY_SCHEME_PRESETS,
} from '@nouto/core/services/openapi/specSkeletons';
import { OPENAPI_OPERATION_METHODS } from '@nouto/core/services/openapi/types';
import type { OpenApiAnalysis } from '@nouto/core/services/openapi/types';

export type OutlineActionId =
  | 'copyJsonPointer'
  | 'addPath'
  | 'addOperation'
  | 'addServer'
  | 'addTag'
  | 'addSecurityRequirement'
  | 'addSecurityScheme'
  | 'addComponent'
  | 'addWebhook'
  | 'tryOperation'
  | 'delete';

/** One context-menu row; `divider: true` rows are separators (id ignored). */
export interface OutlineMenuEntry {
  id: OutlineActionId;
  label: string;
  icon?: string;
  danger?: boolean;
  divider?: boolean;
  disabled?: boolean;
  /** Action-specific input replacing VS Code's QuickPick result. */
  payload?: Record<string, unknown>;
}

function hasToken(contextValue: string | undefined, token: string): boolean {
  return contextValue !== undefined && contextValue.split(' ').includes(token);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Methods not yet present on the path item / webhook at `pointer`. */
function unusedMethods(analysis: OpenApiAnalysis | null, pointer: string | undefined): string[] {
  if (!analysis?.parsedSpec || pointer === undefined) return [...OPENAPI_OPERATION_METHODS];
  const lookup = getByPointer(analysis.parsedSpec, pointer);
  const existing = lookup.found && isRecord(lookup.value)
    ? new Set(Object.keys(lookup.value))
    : new Set<string>();
  return OPENAPI_OPERATION_METHODS.filter((method) => !existing.has(method));
}

/** Declared security-scheme names, for the Security group's flat entries. */
function securitySchemeNames(analysis: OpenApiAnalysis | null): string[] {
  if (!analysis?.parsedSpec) return [];
  const lookup = getByPointer(analysis.parsedSpec, '/components/securitySchemes');
  return lookup.found && isRecord(lookup.value) ? Object.keys(lookup.value) : [];
}

const DELETE_LABELS: ReadonlyArray<[token: string, label: string]> = [
  ['outlinePath', 'Delete Path'],
  ['outlineOperation', 'Delete Operation'],
  ['outlineWebhookOperation', 'Delete Operation'],
  ['outlineServer', 'Delete Server'],
  ['outlineTag', 'Delete Tag'],
  ['outlineSecurityRequirement', 'Delete Security Requirement'],
  ['outlineComponentItem', 'Delete Component'],
  ['outlineWebhook', 'Delete Webhook'],
];

const DIVIDER: OutlineMenuEntry = { id: 'copyJsonPointer', label: '', divider: true };

/**
 * The full menu for a node. Every edit entry is disabled while the document
 * has errors (mirrors vscode's `openApiOutlineHasErrors` guard, rendered as
 * disabled items instead of hidden ones); Copy JSON Pointer and Try It stay
 * enabled. Returns [] for nodes with no menu (e.g. the Info group's plain
 * value rows).
 */
export function buildOutlineMenu(
  node: OutlineNode,
  analysis: OpenApiAnalysis | null,
  hasErrors: boolean
): OutlineMenuEntry[] {
  const context = node.contextValue;
  const adds: OutlineMenuEntry[] = [];

  if (hasToken(context, 'outlinePathsGroup')) {
    adds.push({ id: 'addPath', label: 'Add Path', icon: 'codicon-add' });
  }

  if (hasToken(context, 'outlinePath') || hasToken(context, 'outlineWebhook')) {
    for (const method of unusedMethods(analysis, node.pointer)) {
      adds.push({
        id: 'addOperation',
        label: `Add ${method.toUpperCase()} Operation`,
        icon: 'codicon-add',
        payload: { method },
      });
    }
  }

  if (hasToken(context, 'outlineServersGroup')) {
    adds.push({ id: 'addServer', label: 'Add Server', icon: 'codicon-add' });
  }

  if (hasToken(context, 'outlineTagsGroup')) {
    adds.push({ id: 'addTag', label: 'Add Tag', icon: 'codicon-add' });
  }

  if (hasToken(context, 'outlineSecurityGroup')) {
    for (const scheme of securitySchemeNames(analysis)) {
      adds.push({
        id: 'addSecurityRequirement',
        label: `Add Requirement: ${scheme}`,
        icon: 'codicon-add',
        payload: { schemes: [scheme] },
      });
    }
    adds.push({
      id: 'addSecurityRequirement',
      label: 'Add Requirement: no authentication (optional)',
      icon: 'codicon-add',
      payload: { schemes: [] },
    });
  }

  const securitySchemeAdds = (): OutlineMenuEntry[] =>
    SECURITY_SCHEME_PRESETS.map((preset) => ({
      id: 'addSecurityScheme' as const,
      label: `Add ${preset.label} Scheme`,
      icon: 'codicon-add',
      payload: { presetId: preset.id },
    }));

  if (hasToken(context, 'outlineComponentsGroup')) {
    // One entry per section plus one per security-scheme preset — the same 14
    // flat entries vscode's Components menu contributes.
    for (const section of Object.keys(COMPONENT_PRESETS)) {
      if (section === 'securitySchemes') continue;
      adds.push({
        id: 'addComponent',
        label: `Add ${COMPONENT_TITLES[section] ?? section}`,
        icon: 'codicon-add',
        payload: { section },
      });
    }
    adds.push(...securitySchemeAdds());
  }

  if (hasToken(context, 'outlineComponentSection')) {
    const section = node.component?.section;
    if (hasToken(context, 'outlineSecuritySchemesSection')) {
      adds.push(...securitySchemeAdds());
    } else if (section) {
      adds.push({
        id: 'addComponent',
        label: `Add ${COMPONENT_TITLES[section] ?? section}`,
        icon: 'codicon-add',
        payload: { section },
      });
    }
  }

  if (hasToken(context, 'outlineWebhooksGroup')) {
    adds.push({ id: 'addWebhook', label: 'Add Webhook', icon: 'codicon-add' });
  }

  for (const entry of adds) entry.disabled = hasErrors;

  const entries: OutlineMenuEntry[] = [...adds];

  if (node.operation) {
    entries.push({
      id: 'tryOperation',
      label: 'Try It — open as a request',
      icon: 'codicon-play',
    });
  }

  if (hasToken(context, 'pointer') && node.pointer !== undefined) {
    if (entries.length) entries.push(DIVIDER);
    entries.push({ id: 'copyJsonPointer', label: 'Copy JSON Pointer', icon: 'codicon-copy' });
  }

  const deleteLabel = DELETE_LABELS.find(([token]) => hasToken(context, token))?.[1];
  if (deleteLabel && node.pointer !== undefined) {
    entries.push(DIVIDER);
    entries.push({
      id: 'delete',
      label: deleteLabel,
      icon: 'codicon-trash',
      danger: true,
      disabled: hasErrors,
    });
  }

  return entries;
}
