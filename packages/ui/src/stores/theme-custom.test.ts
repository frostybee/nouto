import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addCustomTheme,
  applyAppearance,
  currentTheme,
  customThemes,
  deleteCustomTheme,
  forkTheme,
  initTheme,
  isCustomTheme,
  PAINT_HINT_KEY,
  setOnAppearanceChanged,
  setTheme,
  themeDefinition,
  updateCustomTheme,
  type AppearanceSettings,
  type ThemePreset,
} from './theme.svelte';

const base: AppearanceSettings = {
  theme: 'system',
  interfaceFont: null,
  interfaceFontSize: 13,
  editorFont: 'JetBrains Mono',
  editorFontSize: 13,
  customThemes: [],
};

const NORDISH: ThemePreset = {
  id: 'nordish',
  name: 'Nordish',
  mode: 'dark',
  accent: '#88c0d0',
  background: '#2e3440',
  foreground: '#d8dee9',
  contrast: 50,
  overrides: { border: '#4c566a' },
};

const root = () => document.documentElement;
const stored = () => JSON.parse(localStorage.getItem('nouto_appearance') ?? '{}');

describe('custom themes', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn(() => ({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
    Object.defineProperty(window, 'dispatchEvent', { writable: true, value: vi.fn() });
    root().removeAttribute('data-theme');
    root().style.cssText = '';
    localStorage.clear();
    setOnAppearanceChanged(null);
    applyAppearance(base);
    localStorage.clear();
  });

  it('adds, activates, and paints a custom theme as inline --hf-* vars', () => {
    const added = addCustomTheme(NORDISH);
    expect(added.id).toBe('nordish');
    expect(isCustomTheme('nordish')).toBe(true);

    setTheme('nordish');
    expect(currentTheme()).toBe('nordish');
    expect(root().getAttribute('data-theme')).toBe('custom');
    expect(root().getAttribute('data-theme-mode')).toBe('dark');
    expect(root().style.getPropertyValue('--hf-editor-background')).toBe('#2e3440');
    expect(root().style.getPropertyValue('--hf-button-background')).toBe('#88c0d0');
    // Pinned override flows through the mapping.
    expect(root().style.getPropertyValue('--hf-panel-border')).toBe('#4c566a');
    expect(stored().customThemes).toHaveLength(1);
    expect(stored().theme).toBe('nordish');

    const hint = JSON.parse(localStorage.getItem(PAINT_HINT_KEY) ?? 'null');
    expect(hint.id).toBe('nordish');
    expect(hint.vars['--hf-editor-background']).toBe('#2e3440');
  });

  it('switching back to a built-in clears inline vars and the paint hint', () => {
    addCustomTheme(NORDISH);
    setTheme('nordish');
    setTheme('dark');
    expect(root().getAttribute('data-theme')).toBe('dark');
    expect(root().style.getPropertyValue('--hf-editor-background')).toBe('');
    expect(localStorage.getItem(PAINT_HINT_KEY)).toBeNull();
  });

  it('dedupes same-content installs and suffixes id collisions', () => {
    const a = addCustomTheme(NORDISH);
    const again = addCustomTheme({ ...NORDISH, id: 'other-id', name: 'Other' });
    expect(again.id).toBe(a.id);
    expect(customThemes()).toHaveLength(1);

    const clash = addCustomTheme({ ...NORDISH, id: 'nord', name: 'Nord', accent: '#ff0000' });
    expect(clash.id).toBe('nord-2');
    expect(clash.name).toBe('Nord (2)');
  });

  it('anchor edits drop pinned overrides and repaint the active theme', () => {
    addCustomTheme(NORDISH);
    setTheme('nordish');
    updateCustomTheme('nordish', { name: 'Renamed' });
    expect(customThemes()[0].overrides).toEqual({ border: '#4c566a' });

    updateCustomTheme('nordish', { background: '#000000' });
    expect(customThemes()[0].overrides).toBeNull();
    expect(root().style.getPropertyValue('--hf-editor-background')).toBe('#000000');
  });

  it('rejects an edit that produces an invalid preset', () => {
    addCustomTheme(NORDISH);
    updateCustomTheme('nordish', { accent: 'not-a-colour' });
    expect(customThemes()[0].accent).toBe('#88c0d0');
  });

  it('deleting the active custom theme falls back to its mode built-in', () => {
    addCustomTheme(NORDISH);
    setTheme('nordish');
    deleteCustomTheme('nordish');
    expect(customThemes()).toHaveLength(0);
    expect(currentTheme()).toBe('dark');
    expect(root().getAttribute('data-theme')).toBe('dark');
  });

  it('forks a built-in into an editable custom theme and activates it', () => {
    const id = forkTheme('nord');
    expect(id).toBe('nord-custom');
    expect(currentTheme()).toBe('nord-custom');
    const def = themeDefinition('nord-custom');
    expect(def?.category).toBe('dark');
    expect(def?.colors.background).toBe('#2e3440');
    expect(forkTheme('system')).toBe('dark-custom');
  });

  it('round-trips custom themes through initTheme and drops invalid entries', () => {
    localStorage.setItem(
      'nouto_appearance',
      JSON.stringify({
        ...base,
        theme: 'nordish',
        customThemes: [NORDISH, { id: 'bad' }, { ...NORDISH, id: 'dark' }],
      }),
    );
    initTheme();
    expect(customThemes().map((t) => t.id)).toEqual(['nordish']);
    expect(currentTheme()).toBe('nordish');
    expect(root().getAttribute('data-theme')).toBe('custom');
  });

  it('a stored theme id that no longer exists resolves to system', () => {
    localStorage.setItem('nouto_appearance', JSON.stringify({ ...base, theme: 'ghost' }));
    initTheme();
    expect(root().getAttribute('data-theme')).toBe('dark');
  });

  it('broadcasts custom themes to appearance listeners', () => {
    const cb = vi.fn();
    setOnAppearanceChanged(cb);
    addCustomTheme(NORDISH);
    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ customThemes: [NORDISH] }));
  });
});
