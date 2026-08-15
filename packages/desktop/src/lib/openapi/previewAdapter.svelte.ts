import { invoke } from '@tauri-apps/api/core';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import { tempDir } from '@tauri-apps/api/path';
import { open as shellOpen } from '@tauri-apps/plugin-shell';
import type { ProxyHttpRequest, ProxyHttpResponse, OpenApiAction } from '@nouto/transport';
import { getRenderer, type OpenApiPreviewRenderer } from '@nouto/ui/lib/openapi-preview/renderers';
import { activeSession, openApiSession } from './session.svelte';
import { bundleSpecForRender } from './bundleForRender';
import { tryOperation } from './tryIt';
import { generateCollectionFromOpenApi } from '../import-export.svelte';
import { buildStandaloneDocsHtml } from './standaloneDocs';

/**
 * Desktop host adapter for the shared OpenApiPreview.svelte component.
 *
 * The component was written against VS Code's webview API shape
 * ({ postMessage, getState, setState }) and receives host messages via
 * window 'message' events. On desktop the host and the UI are the same
 * process: outgoing messages dispatch to local functions, and incoming
 * messages are delivered with window.postMessage — the component's guard
 * accepts them because their source is the window itself, not the
 * sandboxed frame.
 *
 * Try It proxy traffic goes through the dedicated `openapi_proxy_fetch`
 * Rust command, which returns the response directly. It must NOT reuse
 * `send_request`: that command reports through the global `requestResponse`
 * event the main response view consumes.
 */

export interface PreviewHostAdapter {
  postMessage: (message: unknown) => void;
  getState: () => unknown;
  setState: (state: unknown) => void;
  /** Pushes the current session snapshot as openApiPreviewData. */
  pushPreviewData: () => void;
}

interface OutgoingPreviewMessage {
  type: string;
  data?: Record<string, unknown>;
}

export function createPreviewAdapter(): PreviewHostAdapter {
  /** requestIds still awaited; openApiProxyCancel deletes, late results drop. */
  const pending = new Set<string>();
  /** In-memory only — renderer/theme persistence across restarts is Phase 5. */
  let localState: unknown = {};

  function deliver(message: unknown): void {
    window.postMessage(message, '*');
  }

  /** Discards a slow bundling pass superseded by a newer push (or tab switch). */
  let pushGeneration = 0;

  async function pushPreviewDataAsync(): Promise<void> {
    const generation = ++pushGeneration;
    // Pin the session object: the facade re-resolves per read, and this
    // function awaits — a tab switch mid-bundle must not mix documents.
    const session = activeSession();
    const data: Record<string, unknown> = {
      documentUri: session?.documentUri ?? 'untitled',
      documentVersion: session?.contentRevision ?? 0,
      stale: session?.previewStale ?? false,
      tryItEnabled: true,
    };
    if (session?.version) {
      data.version = session.version;
    }
    // Omitted while stale: the component retains its last valid render.
    if (session && !session.previewStale && session.lastValidSpec) {
      const bundled = await bundleSpecForRender(session);
      if (generation !== pushGeneration) return;
      if (bundled.spec) data.spec = $state.snapshot(bundled.spec);
      if (bundled.externalRefsIncomplete) data.externalRefsIncomplete = true;
    }
    deliver({ type: 'openApiPreviewData', data });
  }

  function pushPreviewData(): void {
    void pushPreviewDataAsync();
  }

  function runAction(
    action: OpenApiAction,
    run: () => { ok: boolean; message: string } | Promise<{ ok: boolean; message: string }>
  ): void {
    deliver({ type: 'openApiActionStarted', data: { action } });
    void Promise.resolve(run()).then((result) => {
      deliver(
        result.ok
          ? { type: 'openApiActionSucceeded', data: { action, message: result.message } }
          : { type: 'openApiActionFailed', data: { action, message: result.message } }
      );
    });
  }

  async function runProxyRequest(requestId: string, request: ProxyHttpRequest): Promise<void> {
    try {
      const response = await invoke<ProxyHttpResponse>('openapi_proxy_fetch', { request });
      if (!pending.delete(requestId)) return; // cancelled while in flight
      deliver({ type: 'openApiProxyResponse', data: { requestId, response } });
    } catch (error) {
      if (!pending.delete(requestId)) return;
      deliver({
        type: 'openApiProxyResponse',
        data: { requestId, error: error instanceof Error ? error.message : String(error) },
      });
    }
  }

  async function openDocsInBrowser(rendererId: OpenApiPreviewRenderer): Promise<void> {
    const session = activeSession();
    if (!session?.lastValidSpec) return;
    try {
      const bundled = await bundleSpecForRender(session);
      if (!bundled.spec) return;
      const descriptor = getRenderer(rendererId);
      const assets = await descriptor.load();
      const html = buildStandaloneDocsHtml({
        title: session.documentUri?.replace(/.*[/\\]/, '') ?? 'OpenAPI Documentation',
        renderer: rendererId,
        js: assets.js,
        css: assets.css,
        spec: $state.snapshot(bundled.spec),
      });
      const tmp = await tempDir();
      const sep = tmp.endsWith('/') || tmp.endsWith('\\') ? '' : '/';
      const filePath = `${tmp}${sep}nouto-openapi-docs.html`;
      await writeTextFile(filePath, html);
      await shellOpen(filePath);
    } catch (error) {
      console.error('[PreviewAdapter] Failed to open docs in browser:', error);
    }
  }

  return {
    getState: () => localState,
    setState: (state) => {
      localState = state;
    },
    pushPreviewData,
    postMessage(message: unknown): void {
      const msg = message as OutgoingPreviewMessage;
      switch (msg.type) {
        case 'openApiPreviewReady':
          pushPreviewData();
          break;
        case 'openApiTryOperation': {
          const { path, method } = msg.data as { path: string; method: string };
          runAction('tryOperation', () => tryOperation(path, method));
          break;
        }
        case 'openApiGenerateCollection':
          runAction('generateCollection', () => {
            if (!openApiSession.format) {
              return { ok: false, message: 'No OpenAPI document is open.' };
            }
            return generateCollectionFromOpenApi(openApiSession.id);
          });
          break;
        case 'openApiProxyRequest': {
          const { requestId, request } = msg.data as {
            requestId: string;
            request: ProxyHttpRequest;
          };
          pending.add(requestId);
          void runProxyRequest(requestId, request);
          break;
        }
        case 'openApiProxyCancel':
          pending.delete((msg.data as { requestId: string }).requestId);
          break;
        case 'openApiOpenDocsInBrowser': {
          const rendererId = (msg.data as { renderer: string }).renderer as OpenApiPreviewRenderer;
          void openDocsInBrowser(rendererId);
          break;
        }
      }
    },
  };
}
