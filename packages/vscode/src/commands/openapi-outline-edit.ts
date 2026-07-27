import * as vscode from 'vscode';
import { getByJsonPointer, OPENAPI_OPERATION_METHODS } from '@nouto/core/services';
import type { OpenApiOutlineProvider } from '../providers/OpenApiOutlineProvider';
import type { OutlineNode } from '../providers/openapi-outline/nodes';
import {
  EDIT_FAILED_MESSAGE,
  applyInsert,
  getOpenApiAnalysis,
  planDeleteAtPointer,
  planInsertArrayItem,
  planInsertObjectMember,
  uniqueMemberKey,
} from '../services/openapi';
import {
  COMPONENT_PLACEHOLDERS,
  COMPONENT_PRESETS,
  OPERATION_SKELETON,
  SECURITY_SCHEME_PRESETS,
  securityRequirementSkeleton,
  serverSkeleton,
  tagSkeleton,
} from '../services/openapi/specSkeletons';

/**
 * Context-menu edit commands of the OpenAPI Outline (42Crunch-style): Copy
 * JSON Pointer plus Add/Delete per node type. Mutations go through specEdit's
 * WorkspaceEdit planners, so a single undo reverts each action; no delete
 * asks for confirmation by design.
 */

/**
 * Group nodes for absent sections carry no pointer, so this guard is looser
 * than reveal's `isOutlineNode`: only `documentUri` is required.
 */
function isEditTarget(value: unknown): value is OutlineNode {
  const node = value as Partial<OutlineNode> | null;
  return !!node && typeof node === 'object' && typeof node.documentUri === 'string';
}

/**
 * Re-resolves the node's document and re-checks analysis at execution time:
 * the `nouto.openApiOutlineHasErrors` context key gating the menu items can
 * lag the rebuild debounce.
 */
async function editableDocument(node: OutlineNode): Promise<vscode.TextDocument | undefined> {
  let document: vscode.TextDocument;
  try {
    document = await vscode.workspace.openTextDocument(vscode.Uri.parse(node.documentUri));
  } catch {
    await vscode.window.showErrorMessage('The OpenAPI document is no longer available.');
    return undefined;
  }
  const analysis = getOpenApiAnalysis(document);
  if (!analysis.parsedSpec || analysis.diagnostics.some((d) => d.severity === 'error')) {
    await vscode.window.showErrorMessage(
      'The OpenAPI document has errors. Fix them before editing it from the outline.'
    );
    return undefined;
  }
  return document;
}

/** Placeholder to select after inserting a fresh operation skeleton. */
const OPERATION_FOCUS = '/responses/200/description';

async function applyDelete(
  document: vscode.TextDocument,
  pointer: string | undefined
): Promise<void> {
  const edit = pointer !== undefined ? planDeleteAtPointer(document, pointer) : undefined;
  if (!edit) {
    await vscode.window.showErrorMessage(EDIT_FAILED_MESSAGE);
    return;
  }
  await vscode.workspace.applyEdit(edit);
}

/** Methods not yet present on the path item at `pathItemPointer`. */
function unusedMethods(document: vscode.TextDocument, pathItemPointer: string): string[] {
  const analysis = getOpenApiAnalysis(document);
  const pathItem = getByJsonPointer(analysis.parsedSpec, pathItemPointer);
  const existing = pathItem.found && pathItem.value && typeof pathItem.value === 'object'
    ? new Set(Object.keys(pathItem.value as Record<string, unknown>))
    : new Set<string>();
  return OPENAPI_OPERATION_METHODS.filter((method) => !existing.has(method));
}

async function pickMethod(
  document: vscode.TextDocument,
  pathItemPointer: string
): Promise<string | undefined> {
  const methods = unusedMethods(document, pathItemPointer);
  if (!methods.length) {
    await vscode.window.showInformationMessage('Every operation method already exists here.');
    return undefined;
  }
  return vscode.window.showQuickPick(
    methods.map((method) => method.toUpperCase()),
    { placeHolder: 'HTTP method for the new operation' }
  ).then((picked) => picked?.toLowerCase());
}

type Handler = (node: OutlineNode) => Promise<void>;

function register(command: string, handler: Handler): vscode.Disposable {
  return vscode.commands.registerCommand(command, async (node: unknown) => {
    if (!isEditTarget(node)) return;
    try {
      await handler(node);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await vscode.window.showErrorMessage(`OpenAPI outline edit failed: ${message}`);
    }
  });
}

export function registerOpenApiOutlineEditCommands(
  provider: OpenApiOutlineProvider
): vscode.Disposable[] {
  const copyJsonPointer = register('nouto.openApiOutline.copyJsonPointer', async (node) => {
    if (typeof node.pointer !== 'string') return;
    await vscode.env.clipboard.writeText(node.pointer);
    vscode.window.setStatusBarMessage(`Copied JSON Pointer: ${node.pointer}`, 2000);
  });

  const addPath = register('nouto.openApiOutline.addPath', async (node) => {
    const document = await editableDocument(node);
    if (!document) return;
    // Prompt-free (42Crunch-style): insert a uniquely named placeholder path
    // with a GET stub; the reveal selects its key for an inline rename.
    const path = uniqueMemberKey(document, '/paths', '/new-path');
    await applyInsert(provider, document,
      planInsertObjectMember(document, '/paths', path, { get: OPERATION_SKELETON }));
  });

  const addOperation = register('nouto.openApiOutline.addOperation', async (node) => {
    if (typeof node.pointer !== 'string') return;
    const document = await editableDocument(node);
    if (!document) return;
    const method = await pickMethod(document, node.pointer);
    if (!method) return;
    await applyInsert(provider, document,
      planInsertObjectMember(document, node.pointer, method, OPERATION_SKELETON),
      OPERATION_FOCUS);
  });

  const addServer = register('nouto.openApiOutline.addServer', async (node) => {
    const document = await editableDocument(node);
    if (!document) return;
    const url = await vscode.window.showInputBox({
      prompt: 'Server URL (e.g. https://api.example.com/v1)',
      validateInput: (value) => (value.trim() ? undefined : 'A server URL is required.'),
    });
    if (!url) return;
    const description = await vscode.window.showInputBox({
      prompt: 'Server description (optional — press Enter to skip)',
    });
    await applyInsert(provider, document,
      planInsertArrayItem(document, '/servers', serverSkeleton(url.trim(), description?.trim() || undefined)));
  });

  const addTag = register('nouto.openApiOutline.addTag', async (node) => {
    const document = await editableDocument(node);
    if (!document) return;
    const name = await vscode.window.showInputBox({
      prompt: 'Tag name',
      validateInput: (value) => (value.trim() ? undefined : 'A tag name is required.'),
    });
    if (!name) return;
    const description = await vscode.window.showInputBox({
      prompt: 'Tag description (optional — press Enter to skip)',
    });
    await applyInsert(provider, document,
      planInsertArrayItem(document, '/tags', tagSkeleton(name.trim(), description?.trim() || undefined)));
  });

  const addSecurityRequirement = register('nouto.openApiOutline.addSecurityRequirement', async (node) => {
    const document = await editableDocument(node);
    if (!document) return;
    const analysis = getOpenApiAnalysis(document);
    const schemes = getByJsonPointer(analysis.parsedSpec, '/components/securitySchemes');
    const names = schemes.found && schemes.value && typeof schemes.value === 'object'
      ? Object.keys(schemes.value as Record<string, unknown>)
      : [];
    const noAuth = 'No authentication (optional security)';
    const picked = await vscode.window.showQuickPick([...names, noAuth], {
      canPickMany: true,
      placeHolder: names.length
        ? 'Security schemes the requirement combines (all must be satisfied)'
        : 'No security schemes defined yet — add one under Components first, or make security optional',
    });
    if (!picked?.length) return;
    const schemeNames = picked.filter((name) => name !== noAuth);
    await applyInsert(provider, document,
      planInsertArrayItem(document, '/security', securityRequirementSkeleton(schemeNames)));
  });

  const insertComponent = async (
    document: vscode.TextDocument,
    section: string
  ): Promise<void> => {
    const name = uniqueMemberKey(
      document,
      `/components/${section}`,
      COMPONENT_PLACEHOLDERS[section] ?? 'NewComponent'
    );
    await applyInsert(provider, document,
      planInsertObjectMember(document, `/components/${section}`, name, COMPONENT_PRESETS[section]));
  };

  const insertSecurityScheme = async (
    document: vscode.TextDocument,
    entry: (typeof SECURITY_SCHEME_PRESETS)[number]
  ): Promise<void> => {
    const name = uniqueMemberKey(document, '/components/securitySchemes', entry.placeholder);
    await applyInsert(provider, document,
      planInsertObjectMember(document, '/components/securitySchemes', name, entry.value));
  };

  const addSecurityScheme = register('nouto.openApiOutline.addSecurityScheme', async (node) => {
    const document = await editableDocument(node);
    if (!document) return;
    const preset = await vscode.window.showQuickPick(
      SECURITY_SCHEME_PRESETS.map((entry) => entry.label),
      { placeHolder: 'Security scheme type' }
    );
    if (!preset) return;
    await insertSecurityScheme(
      document,
      SECURITY_SCHEME_PRESETS.find((candidate) => candidate.label === preset)!
    );
  });

  const addComponent = register('nouto.openApiOutline.addComponent', async (node) => {
    const document = await editableDocument(node);
    if (!document) return;
    // Section nodes already carry their section; the picker is the fallback for
    // any caller that does not. securitySchemes routes through its own command.
    const section = node.component?.section
      ?? await vscode.window.showQuickPick(
        Object.keys(COMPONENT_PRESETS),
        { placeHolder: 'Component section' }
      );
    if (!section) return;
    if (section === 'securitySchemes') {
      await vscode.commands.executeCommand('nouto.openApiOutline.addSecurityScheme', node);
      return;
    }
    await insertComponent(document, section);
  });

  // One direct command per component section and per security-scheme preset, so
  // the Components context menu can offer every insertable item without a
  // picker round trip. Derived from the preset tables rather than hand-listed:
  // package.json mirrors these ids statically, and a drift test fails if the
  // two ever disagree.
  const addComponentDirect = Object.keys(COMPONENT_PRESETS).map((section) =>
    register(`nouto.openApiOutline.addComponent.${section}`, async (node) => {
      const document = await editableDocument(node);
      if (!document) return;
      await insertComponent(document, section);
    })
  );

  const addSecuritySchemeDirect = SECURITY_SCHEME_PRESETS.map((entry) =>
    register(`nouto.openApiOutline.addSecurityScheme.${entry.id}`, async (node) => {
      const document = await editableDocument(node);
      if (!document) return;
      await insertSecurityScheme(document, entry);
    })
  );

  const addWebhook = register('nouto.openApiOutline.addWebhook', async (node) => {
    const document = await editableDocument(node);
    if (!document) return;
    // Prompt-free: webhooks are conventionally POST; the reveal selects the
    // placeholder key for an inline rename.
    const name = uniqueMemberKey(document, '/webhooks', 'newWebhook');
    await applyInsert(provider, document,
      planInsertObjectMember(document, '/webhooks', name, { post: OPERATION_SKELETON }));
  });

  const deleteAtNodePointer = (command: string): vscode.Disposable =>
    register(command, async (node) => {
      if (typeof node.pointer !== 'string') return;
      const document = await editableDocument(node);
      if (!document) return;
      await applyDelete(document, node.pointer);
    });

  return [
    copyJsonPointer,
    addPath,
    addOperation,
    addServer,
    addTag,
    addSecurityRequirement,
    addSecurityScheme,
    addComponent,
    ...addComponentDirect,
    ...addSecuritySchemeDirect,
    addWebhook,
    deleteAtNodePointer('nouto.openApiOutline.deletePath'),
    deleteAtNodePointer('nouto.openApiOutline.deleteOperation'),
    deleteAtNodePointer('nouto.openApiOutline.deleteServer'),
    deleteAtNodePointer('nouto.openApiOutline.deleteTag'),
    deleteAtNodePointer('nouto.openApiOutline.deleteSecurityRequirement'),
    deleteAtNodePointer('nouto.openApiOutline.deleteComponent'),
    deleteAtNodePointer('nouto.openApiOutline.deleteWebhook'),
  ];
}
