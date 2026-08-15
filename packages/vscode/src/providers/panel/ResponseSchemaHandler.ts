import * as vscode from 'vscode';
import { deriveSchemaName, inferJsonSchema } from '@nouto/core/services';
import {
  applyInsert,
  isKnownOpenApiDocument,
  getOpenApiAnalysis,
  planInsertObjectMember,
  uniqueMemberKey,
} from '../../services/openapi';
import type { OutlineRevealTarget } from '../../services/openapi';
import { COMPONENT_PLACEHOLDERS } from '@nouto/core/services';

/**
 * Host side of the response viewer's "Add as component schema" action: infer
 * a JSON Schema from the response body the webview sends and insert it under
 * `/components/schemas` of an open OpenAPI document, using the outline edit
 * commands' exact insert recipe (unique placeholder key, single-undo edit,
 * reveal with the key selected for an inline rename).
 *
 * The webview sends the raw body, not a schema: only the host knows the
 * target document's OpenAPI version, which decides how nullability is
 * encoded (`nullable: true` on 3.0 vs `type` arrays on 3.1+).
 */

export interface AddResponseSchemaData {
  body: unknown;
  requestUrl?: string;
}

export class ResponseSchemaHandler {
  async addResponseSchemaToSpec(
    outlineTarget: OutlineRevealTarget | undefined,
    data: AddResponseSchemaData
  ): Promise<void> {
    if (!outlineTarget) {
      await vscode.window.showErrorMessage('The OpenAPI outline is not ready yet. Try again in a moment.');
      return;
    }

    const document = await this.resolveTargetDocument();
    if (!document) return;

    // Mirrors the outline menu's error gate (`!nouto.openApiOutlineHasErrors`),
    // which this webview-originated entry point would otherwise bypass.
    const analysis = getOpenApiAnalysis(document);
    if (!analysis.parsedSpec || !analysis.version
      || analysis.diagnostics.some((d) => d.severity === 'error')) {
      await vscode.window.showErrorMessage(
        'The OpenAPI document has errors. Fix them before adding a schema.'
      );
      return;
    }

    const schema = inferJsonSchema(parseBody(data.body), { dialect: analysis.version });
    const name = uniqueMemberKey(
      document,
      '/components/schemas',
      deriveSchemaName(data.requestUrl) ?? COMPONENT_PLACEHOLDERS.schemas
    );
    await applyInsert(outlineTarget, document,
      planInsertObjectMember(document, '/components/schemas', name, schema));
  }

  /**
   * The insert target among open documents: errors when none is OpenAPI, a
   * QuickPick when several are. A webview button click has no active-editor
   * tie, so "the" document cannot be resolved the way editor commands do.
   */
  private async resolveTargetDocument(): Promise<vscode.TextDocument | undefined> {
    const candidates = vscode.workspace.textDocuments.filter(
      (doc) => isKnownOpenApiDocument(doc)
    );
    if (!candidates.length) {
      await vscode.window.showErrorMessage('Open an OpenAPI document first.');
      return undefined;
    }
    if (candidates.length === 1) return candidates[0];

    const picked = await vscode.window.showQuickPick(
      candidates.map((doc) => ({
        label: doc.uri.path.split('/').pop() || doc.uri.toString(),
        description: vscode.workspace.asRelativePath(doc.uri, true),
        doc,
      })),
      { placeHolder: 'Add the schema to which OpenAPI document?' }
    );
    return picked?.doc;
  }
}

/** Bodies normally arrive parsed; tolerate a JSON string from older senders. */
function parseBody(body: unknown): unknown {
  if (typeof body !== 'string') return body;
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}
