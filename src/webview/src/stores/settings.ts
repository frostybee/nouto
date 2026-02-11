import { writable, derived } from 'svelte/store';
import { resolveShortcuts, type ShortcutMap, type ShortcutAction, type ShortcutBinding, SHORTCUT_DEFINITIONS, bindingToDisplayString } from '../lib/shortcuts';
import { postMessage } from '../lib/vscode';

export interface UserSettings {
  autoCorrectUrls: boolean;
  shortcuts: ShortcutMap;
}

export const settings = writable<UserSettings>({
  autoCorrectUrls: false,
  shortcuts: {},
});

/** Resolved shortcuts: merges user overrides with defaults */
export const resolvedShortcuts = derived(settings, ($s) => resolveShortcuts($s.shortcuts));

export function loadSettings(data: UserSettings) {
  settings.set({
    autoCorrectUrls: data.autoCorrectUrls ?? false,
    shortcuts: data.shortcuts ?? {},
  });
}

export function updateShortcut(id: ShortcutAction, binding: ShortcutBinding) {
  const displayString = bindingToDisplayString(binding);
  settings.update((s) => {
    const next = { ...s, shortcuts: { ...s.shortcuts, [id]: displayString } };
    postMessage({ type: 'updateSettings', data: next });
    return next;
  });
}

export function resetShortcut(id: ShortcutAction) {
  settings.update((s) => {
    const { [id]: _, ...rest } = s.shortcuts;
    const next = { ...s, shortcuts: rest };
    postMessage({ type: 'updateSettings', data: next });
    return next;
  });
}

export function resetAllShortcuts() {
  settings.update((s) => {
    const next = { ...s, shortcuts: {} };
    postMessage({ type: 'updateSettings', data: next });
    return next;
  });
}
