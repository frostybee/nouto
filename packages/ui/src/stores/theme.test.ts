import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyAppearance,
  currentTheme,
  editorFont,
  editorFontSize,
  interfaceFont,
  interfaceFontSize,
  setEditorFont,
  setEditorFontSize,
  setOnAppearanceChanged,
  type AppearanceSettings,
} from './theme.svelte';

const defaultAppearance: AppearanceSettings = {
  theme: 'system',
  interfaceFont: null,
  interfaceFontSize: 13,
  editorFont: 'JetBrains Mono',
  editorFontSize: 13,
};

function storedAppearance(): AppearanceSettings {
  return JSON.parse(localStorage.getItem('nouto_appearance') ?? '{}');
}

describe('theme store', () => {
  let dispatchEventMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });

    dispatchEventMock = vi.fn();
    Object.defineProperty(window, 'dispatchEvent', {
      writable: true,
      value: dispatchEventMock,
    });

    document.documentElement.removeAttribute('data-theme');
    document.documentElement.style.cssText = '';
    localStorage.clear();
    setOnAppearanceChanged(null);
    applyAppearance(defaultAppearance);
    localStorage.clear();
    dispatchEventMock.mockClear();
  });

  it('persists editor font changes to appearance storage', () => {
    setEditorFont('Fira Code');
    setEditorFontSize(16);

    expect(storedAppearance()).toEqual({
      ...defaultAppearance,
      editorFont: 'Fira Code',
      editorFontSize: 16,
    });
  });

  it('notifies listeners with the complete appearance payload', () => {
    const onAppearanceChanged = vi.fn();
    setOnAppearanceChanged(onAppearanceChanged);

    setEditorFont('Cascadia Code');

    expect(onAppearanceChanged).toHaveBeenCalledWith({
      ...defaultAppearance,
      editorFont: 'Cascadia Code',
    });
  });

  it('applies received appearance data to state, storage, CSS variables, and CodeMirror listeners', () => {
    applyAppearance({
      theme: 'dark',
      interfaceFont: 'Inter',
      interfaceFontSize: 14,
      editorFont: 'Fira Code',
      editorFontSize: 18,
    });

    expect(currentTheme()).toBe('dark');
    expect(interfaceFont()).toBe('Inter');
    expect(interfaceFontSize()).toBe(14);
    expect(editorFont()).toBe('Fira Code');
    expect(editorFontSize()).toBe(18);
    expect(storedAppearance()).toEqual({
      theme: 'dark',
      interfaceFont: 'Inter',
      interfaceFontSize: 14,
      editorFont: 'Fira Code',
      editorFontSize: 18,
    });
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.documentElement.style.getPropertyValue('--hf-editor-font-family')).toContain("'Fira Code'");
    expect(document.documentElement.style.getPropertyValue('--hf-editor-font-size')).toBe('18px');
    expect(dispatchEventMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'nouto-font-change' }));
  });

  it('removes the custom editor font variable when editor font is null', () => {
    applyAppearance({
      ...defaultAppearance,
      editorFont: 'Fira Code',
    });
    expect(document.documentElement.style.getPropertyValue('--hf-editor-font-family')).toContain("'Fira Code'");

    applyAppearance({
      ...defaultAppearance,
      editorFont: null,
    });

    expect(editorFont()).toBeNull();
    expect(document.documentElement.style.getPropertyValue('--hf-editor-font-family')).toBe('');
  });
});
