/**
 * Outline context-menu action → offset-edit plan — the desktop, dialog-free
 * port of vscode's openapi-outline-edit commands. QuickPick/InputBox inputs
 * arrive pre-resolved in the menu entry's payload (method, preset id,
 * section, scheme names); free-text values become skeleton placeholders and
 * the plan's `reveal` selects them for inline overwrite/rename, mirroring
 * vscode's applyInsert focus behavior. Pure: the Svelte layer feeds the plan
 * to the editor surface's applyEdits.
 */
import type { OutlineNode } from '@nouto/core/services/openapi/outline';
import {
  planDeleteAtPointer,
  planInsertArrayItem,
  planInsertObjectMember,
} from '@nouto/core/services/openapi/specEdit';
import type { SpecEditPlan, SpecTextEdit } from '@nouto/core/services/openapi/specEdit';
import { uniqueMemberKey, uniqueName } from '@nouto/core/services/openapi/specNaming';
import {
  COMPONENT_PLACEHOLDERS,
  COMPONENT_PRESETS,
  OPERATION_SKELETON,
  SECURITY_SCHEME_PRESETS,
  securityRequirementSkeleton,
  serverSkeleton,
  tagSkeleton,
} from '@nouto/core/services/openapi/specSkeletons';
import type { OpenApiAnalysis, OpenApiFormat } from '@nouto/core/services/openapi/types';
import type { OutlineActionId } from './outlineMenu';

export interface OutlineEditPlan {
  edits: SpecTextEdit[];
  /** Post-edit cursor target; absent for deletes and pure appends. */
  reveal?: { pointer: string; selectValue: boolean };
}

export const OUTLINE_EDIT_FAILED_MESSAGE =
  'The document could not be edited safely at this location.';

/** Placeholder to select after inserting a fresh operation skeleton. */
const OPERATION_FOCUS = '/responses/200/description';

const PLACEHOLDER_SERVER_URL = 'https://api.example.com';

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/** Insert plan → edit plan with the inserted key anchored for inline rename. */
function keyReveal(plan: SpecEditPlan | undefined): OutlineEditPlan | { error: string } {
  if (!plan) return { error: OUTLINE_EDIT_FAILED_MESSAGE };
  return { edits: plan.edits, reveal: { pointer: plan.insertedPointer, selectValue: false } };
}

/**
 * Plans the edit for an outline context-menu action. Returns undefined for
 * actions that never reach the planner (copy pointer, Try It) or malformed
 * payloads; `{error}` when a spec-edit planner refuses the target.
 */
export function planOutlineEditAction(
  node: OutlineNode,
  actionId: OutlineActionId,
  payload: Record<string, unknown> | undefined,
  content: string,
  format: OpenApiFormat,
  analysis: OpenApiAnalysis
): OutlineEditPlan | { error: string } | undefined {
  const doc = { text: content, format };
  const spec = analysis.parsedSpec;

  switch (actionId) {
    case 'addPath': {
      // Prompt-free (42Crunch-style): a uniquely named placeholder path with a
      // GET stub; the reveal selects its key for an inline rename.
      const path = uniqueMemberKey(spec, '/paths', '/new-path');
      return keyReveal(planInsertObjectMember(doc, '/paths', path, { get: OPERATION_SKELETON }));
    }

    case 'addOperation': {
      const method = asString(payload?.method);
      if (method === undefined || node.pointer === undefined) return undefined;
      const plan = planInsertObjectMember(doc, node.pointer, method, OPERATION_SKELETON);
      if (!plan) return { error: OUTLINE_EDIT_FAILED_MESSAGE };
      return {
        edits: plan.edits,
        reveal: { pointer: `${plan.insertedPointer}${OPERATION_FOCUS}`, selectValue: true },
      };
    }

    case 'addServer': {
      // No URL prompt: a placeholder URL is inserted with its value selected,
      // so typing overwrites it in place.
      const plan = planInsertArrayItem(doc, '/servers', serverSkeleton(PLACEHOLDER_SERVER_URL));
      if (!plan) return { error: OUTLINE_EDIT_FAILED_MESSAGE };
      return {
        edits: plan.edits,
        reveal: { pointer: `${plan.insertedPointer}/url`, selectValue: true },
      };
    }

    case 'addTag': {
      const existing = Array.isArray((spec as { tags?: unknown[] } | undefined)?.tags)
        ? ((spec as { tags: unknown[] }).tags
            .map((tag) => (tag && typeof tag === 'object' ? (tag as { name?: unknown }).name : undefined))
            .filter((name): name is string => typeof name === 'string'))
        : [];
      const name = uniqueName(existing, 'newTag');
      const plan = planInsertArrayItem(doc, '/tags', tagSkeleton(name));
      if (!plan) return { error: OUTLINE_EDIT_FAILED_MESSAGE };
      return {
        edits: plan.edits,
        reveal: { pointer: `${plan.insertedPointer}/name`, selectValue: true },
      };
    }

    case 'addSecurityRequirement': {
      const schemes = Array.isArray(payload?.schemes)
        ? payload.schemes.filter((scheme): scheme is string => typeof scheme === 'string')
        : undefined;
      if (!schemes) return undefined;
      const plan = planInsertArrayItem(doc, '/security', securityRequirementSkeleton(schemes));
      if (!plan) return { error: OUTLINE_EDIT_FAILED_MESSAGE };
      // The empty `{}` (no-auth) requirement has nothing to select.
      return schemes.length
        ? { edits: plan.edits, reveal: { pointer: plan.insertedPointer, selectValue: false } }
        : { edits: plan.edits };
    }

    case 'addSecurityScheme': {
      const presetId = asString(payload?.presetId);
      const preset = SECURITY_SCHEME_PRESETS.find((candidate) => candidate.id === presetId);
      if (!preset) return undefined;
      const name = uniqueMemberKey(spec, '/components/securitySchemes', preset.placeholder);
      return keyReveal(
        planInsertObjectMember(doc, '/components/securitySchemes', name, preset.value)
      );
    }

    case 'addComponent': {
      const section = asString(payload?.section);
      if (section === undefined || !(section in COMPONENT_PRESETS)) return undefined;
      const name = uniqueMemberKey(
        spec,
        `/components/${section}`,
        COMPONENT_PLACEHOLDERS[section] ?? 'NewComponent'
      );
      return keyReveal(
        planInsertObjectMember(doc, `/components/${section}`, name, COMPONENT_PRESETS[section])
      );
    }

    case 'addWebhook': {
      // Prompt-free: webhooks are conventionally POST; the reveal selects the
      // placeholder key for an inline rename.
      const name = uniqueMemberKey(spec, '/webhooks', 'newWebhook');
      return keyReveal(
        planInsertObjectMember(doc, '/webhooks', name, { post: OPERATION_SKELETON })
      );
    }

    case 'delete': {
      if (node.pointer === undefined) return undefined;
      const edits = planDeleteAtPointer(doc, node.pointer);
      if (!edits) return { error: OUTLINE_EDIT_FAILED_MESSAGE };
      // No confirmation and no reveal — a single undo restores the node.
      return { edits };
    }

    default:
      // copyJsonPointer / tryOperation are handled by the Svelte layer.
      return undefined;
  }
}
