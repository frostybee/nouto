import { OpenApiImportService } from '@nouto/core/services/openapi/OpenApiImportService';
import { OpenApiConversionError } from '@nouto/core/services/openapi/types';
import { createRequestTab, openTab } from '@nouto/ui/stores/tabs.svelte';
import { showNotification } from '@nouto/ui/stores/notifications.svelte';
import { openApiSession } from './session.svelte';

/**
 * "Try It": converts one operation of the current OpenAPI document into a
 * prefilled, unsaved request tab. Never executes the request. Works off the
 * session's current content, so unsaved edits are included (parity with
 * VS Code's authoritative-TextDocument behavior).
 */

const importService = new OpenApiImportService();

export interface TryItOutcome {
  ok: boolean;
  /** User-facing result line (the preview surfaces it in its action banner). */
  message: string;
}

let setView: ((view: string) => void) | undefined;

/** Wired once from App.svelte (same DI shape as initImportExport). */
export function initTryIt(deps: { setView: (view: string) => void }): void {
  setView = deps.setView;
}

export function tryOperation(path: string, method: string): TryItOutcome {
  if (!openApiSession.format) {
    return { ok: false, message: 'No OpenAPI document is open.' };
  }
  openApiSession.selectedOperation = { path, method };
  try {
    const { request, warnings } = importService.convertSingleOperation(
      openApiSession.content,
      openApiSession.format,
      path,
      method
    );
    const tab = createRequestTab(request.name, null, null, null);
    tab.icon = request.method;
    tab.method = request.method;
    tab.url = request.url;
    tab.params = request.params;
    tab.pathParams = request.pathParams ?? [];
    tab.headers = request.headers;
    tab.auth = request.auth;
    tab.body = request.body;
    openTab(tab);
    // Direct view assignment, not switchView(): opening a Try It tab must not
    // raise the OpenAPI dirty prompt — the session stays alive underneath
    // (same bypass as handleStartFromScratch).
    setView?.('main');
    if (warnings.length > 0) {
      showNotification('warning', `Opened with caveats: ${warnings.join(' — ')}`);
    }
    return { ok: true, message: `Opened "${request.name}" as an unsaved request.` };
  } catch (error) {
    const message =
      error instanceof OpenApiConversionError
        ? error.message
        : `Try It failed: ${error instanceof Error ? error.message : String(error)}`;
    showNotification('error', message);
    return { ok: false, message };
  }
}
