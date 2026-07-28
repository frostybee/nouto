import * as vscode from 'vscode';
import { resolveExternalRefUri } from '@nouto/core/services';
import type { FileResolver, OpenApiFormat } from '@nouto/core/services';

function formatOfLanguage(languageId: string): OpenApiFormat {
  return languageId === 'yaml' ? 'yaml' : 'json';
}

/** Infers the document format of a closed file from its extension. */
export function formatOfExtension(uri: vscode.Uri): OpenApiFormat {
  return /\.ya?ml$/i.test(uri.path) ? 'yaml' : 'json';
}

/**
 * The VS Code `FileResolver`: URI arithmetic is core's shared implementation;
 * `load` prefers open editors (unsaved edits included) over the file system.
 * Stateless — freshness/caching is the analysis cache's concern.
 */
export class VscodeFileResolver implements FileResolver {
  resolve(fromUri: string, refPath: string): string {
    return resolveExternalRefUri(fromUri, refPath);
  }

  async load(uri: string): Promise<{ content: string; format: OpenApiFormat } | undefined> {
    const open = vscode.workspace.textDocuments.find(
      (document) => document.uri.toString() === uri
    );
    if (open) {
      return { content: open.getText(), format: formatOfLanguage(open.languageId) };
    }
    try {
      const target = vscode.Uri.parse(uri);
      const bytes = await vscode.workspace.fs.readFile(target);
      return { content: Buffer.from(bytes).toString('utf8'), format: formatOfExtension(target) };
    } catch {
      return undefined;
    }
  }
}
