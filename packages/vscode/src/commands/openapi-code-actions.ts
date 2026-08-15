import * as vscode from 'vscode';
import * as yaml from 'js-yaml';
import { COMPONENT_PRESETS, parseJsonPointer } from '@nouto/core/services';
import type { OpenApiFormat } from '@nouto/core/services';
import { formatOfExtension } from '../services/openapi';

/** Payload of the create-external-file quick-fix command. */
export interface CreateExternalFilePayload {
  /** Absolute URI of the file to create. */
  targetUri: string;
  /** Pointer the broken `$ref` expected in the file; '' for whole-doc refs. */
  targetPointer: string;
}

function isPayload(value: unknown): value is CreateExternalFilePayload {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof (value as CreateExternalFilePayload).targetUri === 'string' &&
    typeof (value as CreateExternalFilePayload).targetPointer === 'string'
  );
}

/**
 * Builds the initial content for a missing referenced file. When the broken
 * ref pointed at `/components/<section>/<name>`, the file is seeded with that
 * component (same preset the in-document `ref-not-found` fix uses) so the ref
 * resolves immediately; any other pointer shape gets an empty parseable doc.
 */
function scaffoldContent(targetPointer: string, format: OpenApiFormat): string {
  const segments = parseJsonPointer(targetPointer);
  let value: unknown = {};
  if (segments && segments.length === 3 && segments[0] === 'components') {
    const [, section, name] = segments;
    value = { components: { [section]: { [name]: COMPONENT_PRESETS[section] ?? {} } } };
  }
  return format === 'yaml' ? yaml.dump(value) : `${JSON.stringify(value, null, 2)}\n`;
}

/**
 * `nouto.openApiCodeAction.createExternalFile` — invoked by the
 * `external-file-not-found` quick fix. Creates the missing referenced file
 * with a scaffold and opens it. File creation cannot be expressed through the
 * fix's WorkspaceEdit in this codebase, hence a command-based action.
 *
 * Refuses to write outside the workspace, and no-ops if the file appeared in
 * the meantime (stale diagnostic race).
 */
export function registerCreateExternalFileCommand(): vscode.Disposable {
  return vscode.commands.registerCommand(
    'nouto.openApiCodeAction.createExternalFile',
    async (payload: unknown) => {
      if (!isPayload(payload)) return;
      const target = vscode.Uri.parse(payload.targetUri);
      if (!vscode.workspace.getWorkspaceFolder(target)) return;
      try {
        await vscode.workspace.fs.stat(target);
        return; // already exists — the diagnostic was stale
      } catch {
        // absent — proceed
      }
      const content = scaffoldContent(payload.targetPointer, formatOfExtension(target));
      await vscode.workspace.fs.writeFile(target, new TextEncoder().encode(content));
      const document = await vscode.workspace.openTextDocument(target);
      await vscode.window.showTextDocument(document);
    }
  );
}
