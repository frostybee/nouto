import { invoke } from '@tauri-apps/api/core';
import type { ProxyHttpRequest, ProxyHttpResponse, OpenApiAction } from '@nouto/transport';
import { openApiSession } from './session.svelte';
import { tryOperation } from './tryIt';
import { generateCollectionFromOpenApi } from '../import-export.svelte';

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

  function pushPreviewData(): void {
    const data: Record<string, unknown> = {
      documentUri: openApiSession.documentUri ?? 'untitled',
      documentVersion: openApiSession.contentRevision,
      stale: openApiSession.previewStale,
      tryItEnabled: true,
    };
    if (openApiSession.version) {
      data.version = openApiSession.version;
    }
    // Omitted while stale: the component retains its last valid render.
    if (!openApiSession.previewStale && openApiSession.lastValidSpec) {
      data.spec = $state.snapshot(openApiSession.lastValidSpec);
    }
    deliver({ type: 'openApiPreviewData', data });
  }

  function runAction(action: OpenApiAction, run: () => { ok: boolean; message: string }): void {
    deliver({ type: 'openApiActionStarted', data: { action } });
    const result = run();
    deliver(
      result.ok
        ? { type: 'openApiActionSucceeded', data: { action, message: result.message } }
        : { type: 'openApiActionFailed', data: { action, message: result.message } }
    );
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
            return generateCollectionFromOpenApi(openApiSession.content, openApiSession.format);
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
      }
    },
  };
}
