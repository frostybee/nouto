import * as vscode from 'vscode';

const SETTINGS_KEY = 'nouto.settings';

const emitter = new vscode.EventEmitter<void>();

/**
 * Fires whenever the shared `nouto.settings` blob changes, regardless of which
 * webview (Settings panel, request panel) or command triggered the write. The
 * OpenAPI diagnostics/outline providers subscribe so their config-derived
 * behavior updates live, replacing the old `onDidChangeConfiguration` path.
 */
export const onNoutoSettingsChanged = emitter.event;

export function fireNoutoSettingsChanged(): void {
  emitter.fire();
}

/**
 * Merges `patch` into the persisted settings blob and notifies subscribers.
 * Used by extension-host code (e.g. the outline sort toggle) that mutates a
 * single setting without going through a webview round-trip.
 */
export async function applyNoutoSettingsPatch(
  context: vscode.ExtensionContext,
  patch: Record<string, unknown>
): Promise<void> {
  const current = context.globalState.get<Record<string, unknown>>(SETTINGS_KEY) ?? {};
  await context.globalState.update(SETTINGS_KEY, { ...current, ...patch });
  fireNoutoSettingsChanged();
}
