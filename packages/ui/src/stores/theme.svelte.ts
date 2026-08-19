/**
 * Theme and appearance store for the Nouto desktop app.
 * Manages theme selection, font settings, persistence, and system theme detection.
 * Svelte 5 runes only.
 *
 * Two kinds of theme coexist:
 * - Built-in themes (THEMES) paint from static CSS keyed on
 *   `[data-theme="<id>"]` (packages/ui/src/styles/themes/).
 * - Custom themes (installed from the VS Code catalog, imported from a file,
 *   or forked from any theme) are ThemePresets: four anchors + optional
 *   overrides. They paint through the OKLCH engine → --hf-* mapping as inline
 *   custom properties on <html>, with `data-theme="custom"`.
 */

import {
  deriveTokensForPreset,
  mergeImportedPreset,
  presetContentEquals,
} from '../lib/theme/presets';
import { deriveHfTokens, HF_TOKEN_NAMES, type HfTokens } from '../lib/theme/hf-mapping';
import { validateThemePreset, type ThemePreset } from '../lib/theme/schema';
import type { ThemeVariantMode } from '../lib/theme/engine';

export type { ThemePreset } from '../lib/theme/schema';

// ── Theme state ──

let _currentTheme = $state<string>('system');
let _customThemes = $state<ThemePreset[]>([]);

export interface AppearanceSettings {
  theme: string;
  interfaceFont: string | null;
  interfaceFontSize: number;
  editorFont: string | null;
  editorFontSize: number;
  /** Engine-backed themes the user installed, imported, or forked. */
  customThemes?: ThemePreset[];
}

/** localStorage key holding the pre-mount paint hint for custom themes. */
export const PAINT_HINT_KEY = 'nouto_paint_hint';

export function currentTheme(): string {
  return _currentTheme;
}

export function setTheme(themeId: string): void {
  _currentTheme = themeId;
  applyTheme(themeId);
  saveAppearance();
}

// ── Font state ──

let _interfaceFont = $state<string | null>(null);
let _interfaceFontSize = $state<number>(13);
let _editorFont = $state<string | null>('JetBrains Mono');
let _editorFontSize = $state<number>(13);

export function interfaceFont(): string | null {
  return _interfaceFont;
}
export function interfaceFontSize(): number {
  return _interfaceFontSize;
}
export function editorFont(): string | null {
  return _editorFont;
}
export function editorFontSize(): number {
  return _editorFontSize;
}

export function setInterfaceFont(font: string | null): void {
  _interfaceFont = font;
  applyFonts();
  saveAppearance();
}

export function setInterfaceFontSize(size: number): void {
  _interfaceFontSize = size;
  applyFonts();
  saveAppearance();
}

export function setEditorFont(font: string | null): void {
  _editorFont = font;
  applyFonts();
  saveAppearance();
}

export function setEditorFontSize(size: number): void {
  _editorFontSize = size;
  applyFonts();
  saveAppearance();
}

// ── Initialization ──

export function initTheme(): void {
  const raw = localStorage.getItem('nouto_appearance');
  if (raw) {
    try {
      const data = JSON.parse(raw);
      _currentTheme = data.theme ?? 'system';
      _interfaceFont = data.interfaceFont ?? null;
      _interfaceFontSize = data.interfaceFontSize ?? 13;
      _editorFont = data.editorFont !== undefined ? data.editorFont : 'JetBrains Mono';
      _editorFontSize = data.editorFontSize ?? 13;
      _customThemes = sanitizeCustomThemes(data.customThemes);
    } catch {
      _currentTheme = 'system';
    }
  } else {
    // Migrate from old key
    const oldTheme = localStorage.getItem('nouto_theme');
    if (oldTheme) {
      _currentTheme = oldTheme;
      localStorage.removeItem('nouto_theme');
    }
  }

  applyTheme(_currentTheme);
  applyFonts();

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (_currentTheme === 'system') applyTheme('system');
  });
}

// ── Internal helpers ──

function resolveSystemTheme(): 'dark' | 'light' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

// Keep in sync with the inline paint-hint scripts in packages/desktop/{index,settings}.html.
function applyTheme(themeId: string): void {
  const root = document.documentElement;
  const custom = _customThemes.find((t) => t.id === themeId);
  if (custom) {
    const hf = deriveHfTokens(deriveTokensForPreset(custom), custom.mode);
    for (const [name, value] of Object.entries(hf)) root.style.setProperty(name, value);
    root.setAttribute('data-theme', 'custom');
    root.setAttribute('data-theme-mode', custom.mode);
    writePaintHint(custom.id, custom.mode, hf);
    return;
  }
  // Built-in (or unknown → system): static CSS owns the colours, so drop
  // any inline --hf-* a previous custom theme left behind. Font vars are not
  // in HF_TOKEN_NAMES and survive.
  for (const name of HF_TOKEN_NAMES) root.style.removeProperty(name);
  const known = themeId === 'system' || THEMES.some((t) => t.id === themeId);
  const resolved = !known || themeId === 'system' ? resolveSystemTheme() : themeId;
  root.setAttribute('data-theme', resolved);
  root.setAttribute('data-theme-mode', resolved === 'light' ? 'light' : 'dark');
  localStorage.removeItem(PAINT_HINT_KEY);
}

/**
 * Cache the derived --hf-* map so the inline <script> in index.html and
 * settings.html can paint a custom theme before any bundle loads.
 */
function writePaintHint(id: string, mode: ThemeVariantMode, vars: HfTokens): void {
  try {
    localStorage.setItem(PAINT_HINT_KEY, JSON.stringify({ id, mode, vars }));
  } catch {
    // Storage full or unavailable: the first paint will just be built-in dark.
  }
}

function applyFonts(): void {
  const root = document.documentElement.style;

  // Interface font
  if (_interfaceFont) {
    root.setProperty(
      '--hf-font-family',
      `'${_interfaceFont}', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`,
    );
  } else {
    root.removeProperty('--hf-font-family');
  }

  // Interface font size
  root.setProperty('--hf-font-size', `${_interfaceFontSize}px`);

  // Editor font
  if (_editorFont) {
    root.setProperty(
      '--hf-editor-font-family',
      `'${_editorFont}', Consolas, 'Courier New', monospace`,
    );
  } else {
    root.removeProperty('--hf-editor-font-family');
  }

  // Editor font size: set both the active size and a base reference for zoom calculations
  root.setProperty('--hf-editor-font-size', `${_editorFontSize}px`);
  root.setProperty('--hf-editor-font-size-base', `${_editorFontSize}px`);

  // Notify CodeMirror instances to re-measure after font change
  window.dispatchEvent(new CustomEvent('nouto-font-change'));
}

let _onAppearanceChanged: ((data: AppearanceSettings) => void) | null = null;

export function setOnAppearanceChanged(cb: ((data: AppearanceSettings) => void) | null): void {
  _onAppearanceChanged = cb;
}

function serializeAppearance(): AppearanceSettings {
  return {
    theme: _currentTheme,
    interfaceFont: _interfaceFont,
    interfaceFontSize: _interfaceFontSize,
    editorFont: _editorFont,
    editorFontSize: _editorFontSize,
    customThemes: $state.snapshot(_customThemes),
  };
}

function saveAppearance(): void {
  const data = serializeAppearance();
  localStorage.setItem('nouto_appearance', JSON.stringify(data));
  _onAppearanceChanged?.(data);
}

export function applyAppearance(data: AppearanceSettings): void {
  _currentTheme = data.theme;
  _interfaceFont = data.interfaceFont;
  _interfaceFontSize = data.interfaceFontSize;
  _editorFont = data.editorFont;
  _editorFontSize = data.editorFontSize;
  _customThemes = sanitizeCustomThemes(data.customThemes);
  localStorage.setItem('nouto_appearance', JSON.stringify(serializeAppearance()));
  applyTheme(_currentTheme);
  applyFonts();
}

// ── Font size options ──

export const FONT_SIZES = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 20, 22, 24, 26, 28, 30];

// ── Theme definitions ──

export interface ThemeDefinition {
  id: string;
  name: string;
  category: 'auto' | 'dark' | 'light';
  colors: {
    background: string;
    foreground: string;
    accent: string;
    sidebar: string;
    button: string;
  };
}

export const THEMES: ThemeDefinition[] = [
  {
    id: 'system',
    name: 'System (Auto)',
    category: 'auto',
    colors: {
      background: '#1e1e1e',
      foreground: '#cccccc',
      accent: '#007acc',
      sidebar: '#252526',
      button: '#0e639c',
    },
  },
  {
    id: 'dark',
    name: 'Dark',
    category: 'dark',
    colors: {
      background: '#1e1e1e',
      foreground: '#cccccc',
      accent: '#007acc',
      sidebar: '#252526',
      button: '#0e639c',
    },
  },
  {
    id: 'light',
    name: 'Light',
    category: 'light',
    colors: {
      background: '#ffffff',
      foreground: '#333333',
      accent: '#0066b8',
      sidebar: '#f3f3f3',
      button: '#0066b8',
    },
  },
  {
    id: 'nord',
    name: 'Nord',
    category: 'dark',
    colors: {
      background: '#2e3440',
      foreground: '#d8dee9',
      accent: '#88c0d0',
      sidebar: '#2e3440',
      button: '#5e81ac',
    },
  },
  {
    id: 'dracula',
    name: 'Dracula',
    category: 'dark',
    colors: {
      background: '#282a36',
      foreground: '#f8f8f2',
      accent: '#bd93f9',
      sidebar: '#21222c',
      button: '#6272a4',
    },
  },
  {
    id: 'solarized-dark',
    name: 'Solarized Dark',
    category: 'dark',
    colors: {
      background: '#002b36',
      foreground: '#839496',
      accent: '#268bd2',
      sidebar: '#002b36',
      button: '#268bd2',
    },
  },
  {
    id: 'solarized-light',
    name: 'Solarized Light',
    category: 'light',
    colors: {
      background: '#fdf6e3',
      foreground: '#657b83',
      accent: '#268bd2',
      sidebar: '#eee8d5',
      button: '#268bd2',
    },
  },
  {
    id: 'monokai',
    name: 'Monokai',
    category: 'dark',
    colors: {
      background: '#272822',
      foreground: '#f8f8f2',
      accent: '#66d9ef',
      sidebar: '#1e1f1c',
      button: '#75715e',
    },
  },
  {
    id: 'github-dark',
    name: 'GitHub Dark',
    category: 'dark',
    colors: {
      background: '#0d1117',
      foreground: '#c9d1d9',
      accent: '#58a6ff',
      sidebar: '#161b22',
      button: '#238636',
    },
  },
  {
    id: 'github-light',
    name: 'GitHub Light',
    category: 'light',
    colors: {
      background: '#ffffff',
      foreground: '#24292f',
      accent: '#0969da',
      sidebar: '#f6f8fa',
      button: '#2da44e',
    },
  },
  {
    id: 'one-dark-pro',
    name: 'One Dark Pro',
    category: 'dark',
    colors: {
      background: '#282c34',
      foreground: '#abb2bf',
      accent: '#61afef',
      sidebar: '#21252b',
      button: '#404754',
    },
  },
  {
    id: 'catppuccin-latte',
    name: 'Catppuccin Latte',
    category: 'light',
    colors: {
      background: '#eff1f5',
      foreground: '#4c4f69',
      accent: '#1e66f5',
      sidebar: '#e6e9ef',
      button: '#1e66f5',
    },
  },
  {
    id: 'catppuccin-frappe',
    name: 'Catppuccin Frappe',
    category: 'dark',
    colors: {
      background: '#303446',
      foreground: '#c6d0f5',
      accent: '#8caaee',
      sidebar: '#292c3c',
      button: '#8caaee',
    },
  },
  {
    id: 'catppuccin-macchiato',
    name: 'Catppuccin Macchiato',
    category: 'dark',
    colors: {
      background: '#24273a',
      foreground: '#cad3f5',
      accent: '#8aadf4',
      sidebar: '#1e2030',
      button: '#8aadf4',
    },
  },
  {
    id: 'catppuccin-mocha',
    name: 'Catppuccin Mocha',
    category: 'dark',
    colors: {
      background: '#1e1e2e',
      foreground: '#cdd6f4',
      accent: '#89b4fa',
      sidebar: '#181825',
      button: '#89b4fa',
    },
  },
  {
    id: 'ayu-light',
    name: 'Ayu Light',
    category: 'light',
    colors: {
      background: '#fafafa',
      foreground: '#5c6166',
      accent: '#ff9940',
      sidebar: '#f8f9fa',
      button: '#ff9940',
    },
  },
  {
    id: 'ayu-dark',
    name: 'Ayu Dark',
    category: 'dark',
    colors: {
      background: '#0b0e14',
      foreground: '#bfbdb6',
      accent: '#e6b450',
      sidebar: '#0d1017',
      button: '#e6b450',
    },
  },
  {
    id: 'rose-pine',
    name: 'Rose Pine',
    category: 'dark',
    colors: {
      background: '#191724',
      foreground: '#e0def4',
      accent: '#c4a7e7',
      sidebar: '#1f1d2e',
      button: '#c4a7e7',
    },
  },
  {
    id: 'rose-pine-dawn',
    name: 'Rose Pine Dawn',
    category: 'light',
    colors: {
      background: '#faf4ed',
      foreground: '#575279',
      accent: '#907aa9',
      sidebar: '#fffaf3',
      button: '#907aa9',
    },
  },
  {
    id: 'rose-pine-moon',
    name: 'Rose Pine Moon',
    category: 'dark',
    colors: {
      background: '#232136',
      foreground: '#e0def4',
      accent: '#c4a7e7',
      sidebar: '#2a273f',
      button: '#c4a7e7',
    },
  },
  {
    id: 'tokyo-night',
    name: 'Tokyo Night',
    category: 'dark',
    colors: {
      background: '#1a1b26',
      foreground: '#a9b1d6',
      accent: '#7aa2f7',
      sidebar: '#16161e',
      button: '#7aa2f7',
    },
  },
  {
    id: 'tokyo-night-day',
    name: 'Tokyo Night Day',
    category: 'light',
    colors: {
      background: '#e1e2e7',
      foreground: '#3760bf',
      accent: '#2e7de9',
      sidebar: '#d4d6e4',
      button: '#2e7de9',
    },
  },
  {
    id: 'everforest-dark',
    name: 'Everforest Dark',
    category: 'dark',
    colors: {
      background: '#2d353b',
      foreground: '#d3c6aa',
      accent: '#a7c080',
      sidebar: '#232a2e',
      button: '#a7c080',
    },
  },
  {
    id: 'everforest-light',
    name: 'Everforest Light',
    category: 'light',
    colors: {
      background: '#fdf6e3',
      foreground: '#5c6a72',
      accent: '#8da101',
      sidebar: '#f2efdf',
      button: '#8da101',
    },
  },
  {
    id: 'gruvbox-dark',
    name: 'Gruvbox Dark',
    category: 'dark',
    colors: {
      background: '#282828',
      foreground: '#ebdbb2',
      accent: '#fabd2f',
      sidebar: '#1d2021',
      button: '#fabd2f',
    },
  },
  {
    id: 'gruvbox-light',
    name: 'Gruvbox Light',
    category: 'light',
    colors: {
      background: '#fbf1c7',
      foreground: '#3c3836',
      accent: '#b57614',
      sidebar: '#f2e5bc',
      button: '#b57614',
    },
  },
  {
    id: 'night-owl',
    name: 'Night Owl',
    category: 'dark',
    colors: {
      background: '#011627',
      foreground: '#d6deeb',
      accent: '#7e57c2',
      sidebar: '#011627',
      button: '#7e57c2',
    },
  },
];

// ── Custom (engine-backed) themes ──

/** Drop anything that is not a valid preset; a bad entry never breaks boot. */
function sanitizeCustomThemes(raw: unknown): ThemePreset[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: ThemePreset[] = [];
  for (const entry of raw) {
    if (validateThemePreset(entry).length > 0) continue;
    const preset = entry as ThemePreset;
    if (seen.has(preset.id) || THEMES.some((t) => t.id === preset.id)) continue;
    seen.add(preset.id);
    out.push(preset);
  }
  return out;
}

export function customThemes(): ThemePreset[] {
  return _customThemes;
}

export function getCustomTheme(id: string): ThemePreset | undefined {
  return _customThemes.find((t) => t.id === id);
}

export function isCustomTheme(id: string): boolean {
  return _customThemes.some((t) => t.id === id);
}

/** Picker/native-chrome view of a custom preset, same shape as a built-in. */
function definitionFromPreset(preset: ThemePreset): ThemeDefinition {
  const sd = deriveTokensForPreset(preset);
  return {
    id: preset.id,
    name: preset.name,
    category: preset.mode,
    colors: {
      background: sd['bg-base'],
      foreground: sd.text,
      accent: sd.accent,
      sidebar: sd['bg-surface'],
      button: sd.accent,
    },
  };
}

/** Custom themes as ThemeDefinitions (for the picker's Custom group). */
export function customThemeDefinitions(): ThemeDefinition[] {
  return _customThemes.map(definitionFromPreset);
}

/** Look up any theme id: built-in first, then custom. */
export function themeDefinition(id: string): ThemeDefinition | undefined {
  const builtin = THEMES.find((t) => t.id === id);
  if (builtin) return builtin;
  const custom = getCustomTheme(id);
  return custom ? definitionFromPreset(custom) : undefined;
}

function reservedThemeIds(): string[] {
  return [...THEMES.map((t) => t.id), ..._customThemes.map((t) => t.id)];
}

/**
 * Register a preset (from the catalog, a file, or a fork). Same-content
 * installs return the existing entry instead of a duplicate; id collisions
 * get a numeric suffix. Does not activate it — see setTheme.
 */
export function addCustomTheme(preset: ThemePreset): ThemePreset {
  const existing = _customThemes.find((t) => presetContentEquals(t, preset));
  if (existing) return existing;
  const merged = mergeImportedPreset(preset, reservedThemeIds());
  _customThemes = [..._customThemes, merged];
  saveAppearance();
  return merged;
}

export type CustomThemePatch = Partial<
  Pick<ThemePreset, 'name' | 'accent' | 'background' | 'foreground' | 'contrast'>
>;

/**
 * Edit a custom theme. Changing any anchor drops the preset's pinned
 * overrides so the whole palette re-derives from the four anchors — the
 * template's "customized" semantics, and the only way an edited background
 * cannot end up fighting a pinned sidebar colour.
 */
export function updateCustomTheme(id: string, patch: CustomThemePatch): void {
  const index = _customThemes.findIndex((t) => t.id === id);
  if (index === -1) return;
  const current = _customThemes[index];
  const anchorsChanged = (['accent', 'background', 'foreground', 'contrast'] as const).some(
    (k) => patch[k] !== undefined && patch[k] !== current[k],
  );
  const next: ThemePreset = {
    ...current,
    ...patch,
    overrides: anchorsChanged ? null : current.overrides,
  };
  if (validateThemePreset(next).length > 0) return;
  _customThemes = _customThemes.map((t, i) => (i === index ? next : t));
  if (_currentTheme === id) applyTheme(id);
  saveAppearance();
}

/** Remove a custom theme; if it was active, fall back to its mode's built-in. */
export function deleteCustomTheme(id: string): void {
  const preset = getCustomTheme(id);
  if (!preset) return;
  _customThemes = _customThemes.filter((t) => t.id !== id);
  if (_currentTheme === id) {
    _currentTheme = preset.mode;
    applyTheme(_currentTheme);
  }
  saveAppearance();
}

/**
 * Fork any theme into an editable custom theme and activate it. Built-ins
 * seed the anchors from their swatch colours (contrast 50); `system` forks
 * whichever mode it currently resolves to.
 */
export function forkTheme(id: string): string | null {
  const sourceId = id === 'system' ? resolveSystemTheme() : id;
  const custom = getCustomTheme(sourceId);
  let preset: ThemePreset;
  if (custom) {
    preset = { ...custom, id: `${custom.id}-copy`, name: `${custom.name} (Copy)` };
  } else {
    const builtin = THEMES.find((t) => t.id === sourceId);
    if (!builtin || builtin.category === 'auto') return null;
    preset = {
      id: `${builtin.id}-custom`,
      name: `${builtin.name} (Custom)`,
      mode: builtin.category,
      accent: builtin.colors.accent,
      background: builtin.colors.background,
      foreground: builtin.colors.foreground,
      contrast: 50,
    };
  }
  const added = addCustomTheme(preset);
  setTheme(added.id);
  return added.id;
}
