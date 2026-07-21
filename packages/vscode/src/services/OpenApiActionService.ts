import * as vscode from 'vscode';
import {
  OpenApiImportService as CoreOpenApiImportService,
  OpenApiConversionError,
} from '@nouto/core/services';
import type { OpenApiFormat, OpenApiImportResult } from '@nouto/core/services';
import type { StorageService } from './StorageService';
import type { RequestPanelManager } from '../providers/RequestPanelManager';
import { detectOpenApiDocument, hasEverBeenOpenApi } from './openapi';

/**
 * The single host-side workflow behind every OpenAPI action: CodeLens Try It,
 * the preview toolbar, the editor/Explorer commands, and the file/URL import
 * command. Actions always read the authoritative TextDocument, so unsaved edits
 * and remote documents convert exactly like saved local ones.
 */

export interface OpenApiActionSuccess {
  ok: true;
  message: string;
  /** Non-fatal conversion caveats, consolidated by the caller into one notice. */
  warnings: string[];
  /**
   * Present when the generated collection carried server variables. Callers
   * MUST report success and release any busy state before awaiting this: it
   * shows a modal-style prompt that would otherwise pin the UI in progress.
   */
  promptEnvironment?: () => Promise<void>;
}

export interface OpenApiActionFailure {
  ok: false;
  message: string;
}

export type OpenApiActionOutcome = OpenApiActionSuccess | OpenApiActionFailure;

export interface OpenApiSource {
  document: vscode.TextDocument;
  content: string;
  format: OpenApiFormat;
}

export interface OpenApiActionDependencies {
  storageService: StorageService;
  panelManager: Pick<RequestPanelManager, 'openDraftRequest'>;
  onCollectionsUpdated: () => void | Promise<void>;
  onEnvironmentsUpdated?: () => void | Promise<void>;
}

/** Signals a resolution/validation problem with a message fit for the user. */
class OpenApiActionError extends Error {}

/** Host wiring shared by extension activation and command registration. */
export function createOpenApiActionService(
  panelManager: Pick<RequestPanelManager, 'openDraftRequest'>,
  sidebarProvider: {
    getStorageService(): StorageService;
    notifyCollectionsUpdated(): void | Promise<void>;
    updateEnvironments(data: Awaited<ReturnType<StorageService['loadEnvironments']>>): void;
  }
): OpenApiActionService {
  const storageService = sidebarProvider.getStorageService();
  return new OpenApiActionService({
    storageService,
    panelManager,
    onCollectionsUpdated: () => sidebarProvider.notifyCollectionsUpdated(),
    onEnvironmentsUpdated: async () => {
      sidebarProvider.updateEnvironments(await storageService.loadEnvironments());
    },
  });
}

export class OpenApiActionService {
  private readonly core = new CoreOpenApiImportService();
  /** Tail of the in-flight action chain per document, keyed by URI string. */
  private readonly queues = new Map<string, Promise<void>>();

  constructor(private readonly deps: OpenApiActionDependencies) {}

  /**
   * Converts one operation from the current document text and opens it as an
   * unsaved request beside the source. The request is never executed.
   */
  async tryOperation(args: {
    uri?: vscode.Uri;
    path: string;
    method: string;
  }): Promise<OpenApiActionOutcome> {
    return this.run(args.uri, async (source) => {
      const { request, warnings } = this.core.convertSingleOperation(
        source.content,
        source.format,
        args.path,
        args.method
      );
      this.deps.panelManager.openDraftRequest(request, {
        viewColumn: vscode.ViewColumn.Beside,
      });
      return {
        ok: true,
        message: `Opened "${request.name}" as an unsaved request.`,
        warnings,
      };
    });
  }

  /**
   * Converts the whole current document into a new collection. Same-name
   * collections are never merged or overwritten — a new one is always appended.
   */
  async generateCollection(uri?: vscode.Uri): Promise<OpenApiActionOutcome> {
    return this.run(uri, async (source) => {
      const result = this.core.importFromString(source.content, source.format);
      return this.persist(result);
    });
  }

  /**
   * Persists an already-converted document (the file/URL import command loads
   * its own content, then reuses this path for storage, refresh, and the
   * environment prompt).
   */
  async persistImportResult(result: OpenApiImportResult): Promise<OpenApiActionOutcome> {
    try {
      return await this.persist(result);
    } catch (error) {
      return { ok: false, message: describeError(error) };
    }
  }

  /**
   * Resolves the document an action targets: an explicit URI (Explorer entry,
   * preview panel, CodeLens) or the active editor. Always routed through
   * openTextDocument so the in-memory, possibly dirty, text wins over disk.
   */
  async resolveSource(uri?: vscode.Uri): Promise<OpenApiSource> {
    const target = uri ?? vscode.window.activeTextEditor?.document.uri;
    if (!target) {
      throw new OpenApiActionError('Open an OpenAPI document first.');
    }

    let document: vscode.TextDocument;
    try {
      document = await vscode.workspace.openTextDocument(target);
    } catch (error) {
      throw new OpenApiActionError(`Could not open ${target.toString()}: ${describeError(error)}`);
    }

    if (!hasEverBeenOpenApi(document.uri) && !detectOpenApiDocument(document).isOpenApi) {
      throw new OpenApiActionError(
        'This document is not a recognized OpenAPI 3.0, 3.1, or 3.2 specification.'
      );
    }

    return { document, content: document.getText(), format: resolveFormat(document) };
  }

  private async persist(result: OpenApiImportResult): Promise<OpenApiActionSuccess> {
    const collections = await this.deps.storageService.loadCollections();
    collections.push(result.collection);
    await this.deps.storageService.saveCollections(collections);
    await this.deps.onCollectionsUpdated();

    const requestCount = countRequests(result.collection.items ?? []);
    const variables = result.variables;

    return {
      ok: true,
      message:
        `Collection "${result.collection.name}" created with ` +
        `${requestCount} request${requestCount === 1 ? '' : 's'}.`,
      warnings: result.warnings ?? [],
      promptEnvironment: variables
        ? async () => {
            const choice = await vscode.window.showInformationMessage(
              `Found ${variables.variables.length} variable${variables.variables.length === 1 ? '' : 's'} ` +
                `in "${result.collection.name}". Save as an environment?`,
              'Yes',
              'No'
            );
            if (choice !== 'Yes') return;

            try {
              const environments = await this.deps.storageService.loadEnvironments();
              environments.environments.push(variables);
              await this.deps.storageService.saveEnvironments(environments);
              await this.deps.onEnvironmentsUpdated?.();
              await vscode.window.showInformationMessage(
                `Environment "${variables.name}" created with ${variables.variables.length} variables.`
              );
            } catch (error) {
              // The collection is already stored; this failure is partial, not
              // a rollback, so the message must not imply the import was undone.
              await vscode.window.showErrorMessage(
                `Collection "${result.collection.name}" was saved, but its environment could not be created: ` +
                  describeError(error)
              );
            }
          }
        : undefined,
    };
  }

  /**
   * Serializes actions per document so repeated clicks cannot interleave
   * conversion with storage writes.
   */
  private async run(
    uri: vscode.Uri | undefined,
    action: (source: OpenApiSource) => Promise<OpenApiActionSuccess>
  ): Promise<OpenApiActionOutcome> {
    let source: OpenApiSource;
    try {
      source = await this.resolveSource(uri);
    } catch (error) {
      return { ok: false, message: describeError(error) };
    }

    const key = source.document.uri.toString();
    const previous = this.queues.get(key) ?? Promise.resolve();
    const result = previous.then(
      () => action(source),
      () => action(source)
    );
    const tail = result.then(
      () => undefined,
      () => undefined
    );
    this.queues.set(key, tail);
    void tail.then(() => {
      if (this.queues.get(key) === tail) this.queues.delete(key);
    });

    try {
      return await result;
    } catch (error) {
      return { ok: false, message: describeError(error) };
    }
  }
}

function resolveFormat(document: vscode.TextDocument): OpenApiFormat {
  if (document.languageId === 'yaml') return 'yaml';
  if (document.languageId === 'json' || document.languageId === 'jsonc') return 'json';
  // Explorer-selected files can arrive before a language is associated.
  const path = document.uri.path.toLowerCase();
  return path.endsWith('.yaml') || path.endsWith('.yml') ? 'yaml' : 'json';
}

function countRequests(items: Array<{ type?: string; children?: unknown[] }>): number {
  let count = 0;
  for (const item of items) {
    if (item?.type === 'folder') {
      count += countRequests((item.children ?? []) as Array<{ type?: string; children?: unknown[] }>);
    } else if (item) {
      count++;
    }
  }
  return count;
}

function describeError(error: unknown): string {
  if (error instanceof OpenApiConversionError || error instanceof OpenApiActionError) {
    return error.message;
  }
  return error instanceof Error ? error.message : String(error);
}
