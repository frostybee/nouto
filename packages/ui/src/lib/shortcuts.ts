// Shortcut system - pure utilities for key binding management

export type ShortcutAction =
  | 'sendRequest'
  | 'cancelRequest'
  | 'toggleLayout'
  | 'saveRequest'
  | 'focusUrl'
  | 'toggleHistoryDrawer'
  | 'newRequest'
  | 'duplicateRequest'
  | 'closePanel'
  | 'switchTabQuery'
  | 'switchTabHeaders'
  | 'switchTabAuth'
  | 'switchTabBody'
  | 'switchTabTests'
  | 'switchTabScripts'
  | 'switchTabNotes'
  | 'openCommandPalette'
  | 'findInResponse'
  | 'switchResponseBody'
  | 'switchResponseHeaders'
  | 'switchResponseCookies'
  | 'switchResponseTiming'
  | 'switchResponseTimeline'
  | 'toggleWordWrap'
  | 'resendRequest'
  | 'focusActiveRequest';

export interface ShortcutBinding {
  key: string;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}

export interface ShortcutDefinition {
  id: ShortcutAction;
  label: string;
  scope: string;
  defaultBinding: ShortcutBinding;
}

/** User overrides stored as display strings, e.g. { sendRequest: "Ctrl+Shift+Enter" } */
export type ShortcutMap = Record<string, string>;

// Modifier-only keys that should not be captured as standalone bindings
const MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta']);

export const SHORTCUT_DEFINITIONS: ShortcutDefinition[] = [
  {
    id: 'sendRequest',
    label: 'Send Request',
    scope: 'Request',
    defaultBinding: { key: 'Enter', ctrlKey: true, shiftKey: false, altKey: false, metaKey: false },
  },
  {
    id: 'cancelRequest',
    label: 'Cancel Request',
    scope: 'Request',
    defaultBinding: { key: 'Escape', ctrlKey: false, shiftKey: false, altKey: false, metaKey: false },
  },
  {
    id: 'toggleLayout',
    label: 'Toggle Layout',
    scope: 'App',
    defaultBinding: { key: 'l', ctrlKey: false, shiftKey: false, altKey: true, metaKey: false },
  },
  {
    id: 'saveRequest',
    label: 'Save to Collection',
    scope: 'Request',
    defaultBinding: { key: 's', ctrlKey: true, shiftKey: false, altKey: false, metaKey: false },
  },
  {
    id: 'focusUrl',
    label: 'Focus URL Bar',
    scope: 'App',
    defaultBinding: { key: 'l', ctrlKey: true, shiftKey: false, altKey: false, metaKey: false },
  },
  {
    id: 'toggleHistoryDrawer',
    label: 'Toggle History Drawer',
    scope: 'App',
    defaultBinding: { key: 'h', ctrlKey: true, shiftKey: true, altKey: false, metaKey: false },
  },
  {
    id: 'newRequest',
    label: 'New Request',
    scope: 'App',
    defaultBinding: { key: 'n', ctrlKey: true, shiftKey: false, altKey: false, metaKey: false },
  },
  {
    id: 'duplicateRequest',
    label: 'Duplicate Request',
    scope: 'Request',
    defaultBinding: { key: 'd', ctrlKey: true, shiftKey: false, altKey: false, metaKey: false },
  },
  {
    id: 'closePanel',
    label: 'Close Panel',
    scope: 'App',
    defaultBinding: { key: 'w', ctrlKey: true, shiftKey: false, altKey: false, metaKey: false },
  },
  {
    id: 'switchTabQuery',
    label: 'Query Params Tab',
    scope: 'Request',
    defaultBinding: { key: '1', ctrlKey: true, shiftKey: false, altKey: false, metaKey: false },
  },
  {
    id: 'switchTabHeaders',
    label: 'Headers Tab',
    scope: 'Request',
    defaultBinding: { key: '2', ctrlKey: true, shiftKey: false, altKey: false, metaKey: false },
  },
  {
    id: 'switchTabAuth',
    label: 'Auth Tab',
    scope: 'Request',
    defaultBinding: { key: '3', ctrlKey: true, shiftKey: false, altKey: false, metaKey: false },
  },
  {
    id: 'switchTabBody',
    label: 'Body Tab',
    scope: 'Request',
    defaultBinding: { key: '4', ctrlKey: true, shiftKey: false, altKey: false, metaKey: false },
  },
  {
    id: 'switchTabTests',
    label: 'Tests Tab',
    scope: 'Request',
    defaultBinding: { key: '5', ctrlKey: true, shiftKey: false, altKey: false, metaKey: false },
  },
  {
    id: 'switchTabScripts',
    label: 'Scripts Tab',
    scope: 'Request',
    defaultBinding: { key: '6', ctrlKey: true, shiftKey: false, altKey: false, metaKey: false },
  },
  {
    id: 'switchTabNotes',
    label: 'Notes Tab',
    scope: 'Request',
    defaultBinding: { key: '7', ctrlKey: true, shiftKey: false, altKey: false, metaKey: false },
  },
  {
    id: 'openCommandPalette',
    label: 'Command Palette',
    scope: 'App',
    defaultBinding: { key: 'p', ctrlKey: true, shiftKey: false, altKey: false, metaKey: false },
  },
  {
    id: 'findInResponse',
    label: 'Find in Response',
    scope: 'Response',
    defaultBinding: { key: 'f', ctrlKey: true, shiftKey: false, altKey: false, metaKey: false },
  },
  {
    id: 'switchResponseBody',
    label: 'Response Body Tab',
    scope: 'Response',
    defaultBinding: { key: '1', ctrlKey: false, shiftKey: false, altKey: true, metaKey: false },
  },
  {
    id: 'switchResponseHeaders',
    label: 'Response Headers Tab',
    scope: 'Response',
    defaultBinding: { key: '2', ctrlKey: false, shiftKey: false, altKey: true, metaKey: false },
  },
  {
    id: 'switchResponseCookies',
    label: 'Response Cookies Tab',
    scope: 'Response',
    defaultBinding: { key: '3', ctrlKey: false, shiftKey: false, altKey: true, metaKey: false },
  },
  {
    id: 'switchResponseTiming',
    label: 'Response Timing Tab',
    scope: 'Response',
    defaultBinding: { key: '4', ctrlKey: false, shiftKey: false, altKey: true, metaKey: false },
  },
  {
    id: 'switchResponseTimeline',
    label: 'Response Timeline Tab',
    scope: 'Response',
    defaultBinding: { key: '5', ctrlKey: false, shiftKey: false, altKey: true, metaKey: false },
  },
  {
    id: 'toggleWordWrap',
    label: 'Toggle Word Wrap',
    scope: 'Response',
    defaultBinding: { key: 'w', ctrlKey: false, shiftKey: false, altKey: true, metaKey: false },
  },
  {
    id: 'resendRequest',
    label: 'Re-send Request',
    scope: 'Request',
    defaultBinding: { key: 'r', ctrlKey: true, shiftKey: true, altKey: false, metaKey: false },
  },
  {
    id: 'focusActiveRequest',
    label: 'Reveal Active Request',
    scope: 'App',
    defaultBinding: { key: '', ctrlKey: false, shiftKey: false, altKey: false, metaKey: false },
  },
];

/** Convert a KeyboardEvent to a ShortcutBinding. Returns null for modifier-only presses. */
export function eventToBinding(e: KeyboardEvent): ShortcutBinding | null {
  if (MODIFIER_KEYS.has(e.key)) return null;
  return {
    key: e.key,
    ctrlKey: e.ctrlKey,
    shiftKey: e.shiftKey,
    altKey: e.altKey,
    metaKey: e.metaKey,
  };
}

/** Format a ShortcutBinding as a human-readable display string, e.g. "Ctrl+Shift+Enter" */
export function bindingToDisplayString(binding: ShortcutBinding): string {
  const parts: string[] = [];
  if (binding.ctrlKey) parts.push('Ctrl');
  if (binding.shiftKey) parts.push('Shift');
  if (binding.altKey) parts.push('Alt');
  if (binding.metaKey) parts.push('Meta');

  // Capitalize single-char keys
  let keyLabel = binding.key;
  if (keyLabel.length === 1) {
    keyLabel = keyLabel.toUpperCase();
  }
  parts.push(keyLabel);
  return parts.join('+');
}

/** Parse a display string like "Ctrl+Enter" back into a ShortcutBinding */
export function parseDisplayString(str: string): ShortcutBinding {
  const parts = str.split('+');
  const binding: ShortcutBinding = {
    key: '',
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    metaKey: false,
  };
  for (const part of parts) {
    const lower = part.toLowerCase();
    if (lower === 'ctrl') binding.ctrlKey = true;
    else if (lower === 'shift') binding.shiftKey = true;
    else if (lower === 'alt') binding.altKey = true;
    else if (lower === 'meta' || lower === 'cmd') binding.metaKey = true;
    else {
      // The actual key - store lowercase for single chars
      binding.key = part.length === 1 ? part.toLowerCase() : part;
    }
  }
  return binding;
}

/** Check if a KeyboardEvent matches a binding. Handles Mac Cmd↔Ctrl equivalence. */
export function matchesBinding(event: KeyboardEvent, binding: ShortcutBinding): boolean {
  // Normalize key comparison (case-insensitive for single chars)
  const eventKey = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  const bindingKey = binding.key.length === 1 ? binding.key.toLowerCase() : binding.key;
  if (eventKey !== bindingKey) return false;

  // On Mac, treat Cmd as Ctrl equivalent
  const eventCtrl = event.ctrlKey || event.metaKey;
  const bindingCtrl = binding.ctrlKey || binding.metaKey;

  if (eventCtrl !== bindingCtrl) return false;
  if (event.shiftKey !== binding.shiftKey) return false;
  if (event.altKey !== binding.altKey) return false;

  return true;
}

/** Merge user overrides with defaults to produce the resolved binding map. */
export function resolveShortcuts(userOverrides: ShortcutMap): Map<ShortcutAction, ShortcutBinding> {
  const result = new Map<ShortcutAction, ShortcutBinding>();
  for (const def of SHORTCUT_DEFINITIONS) {
    const override = userOverrides[def.id];
    if (override) {
      result.set(def.id, parseDisplayString(override));
    } else {
      result.set(def.id, { ...def.defaultBinding });
    }
  }
  return result;
}

/** Detect conflicts: pairs of actions that share the same binding. */
export function detectConflicts(shortcuts: Map<ShortcutAction, ShortcutBinding>): [ShortcutAction, ShortcutAction][] {
  const conflicts: [ShortcutAction, ShortcutAction][] = [];
  const entries = Array.from(shortcuts.entries());
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const [idA, bindingA] = entries[i];
      const [idB, bindingB] = entries[j];
      if (bindingsEqual(bindingA, bindingB)) {
        conflicts.push([idA, idB]);
      }
    }
  }
  return conflicts;
}

function bindingsEqual(a: ShortcutBinding, b: ShortcutBinding): boolean {
  const keyA = a.key.length === 1 ? a.key.toLowerCase() : a.key;
  const keyB = b.key.length === 1 ? b.key.toLowerCase() : b.key;
  return (
    keyA === keyB &&
    a.ctrlKey === b.ctrlKey &&
    a.shiftKey === b.shiftKey &&
    a.altKey === b.altKey &&
    a.metaKey === b.metaKey
  );
}
