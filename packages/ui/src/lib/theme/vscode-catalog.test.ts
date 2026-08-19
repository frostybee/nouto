import { describe, it, expect } from 'vitest';
import { listCatalogThemes, loadCatalogTheme } from './vscode-catalog';
import { VSCODE_CATALOG } from './vscode-catalog-index';
import { validateThemePreset } from './schema';
import { contrastRatio } from './color';

const files = Object.keys(import.meta.glob('./vscode-themes/*.json')).map((p) =>
  p.replace('./vscode-themes/', ''),
);

describe('vendored catalog integrity', () => {
  it('index covers exactly the vendored files with unique ids', () => {
    expect(VSCODE_CATALOG.map((e) => e.file).sort()).toEqual([...files].sort());
    expect(new Set(VSCODE_CATALOG.map((e) => e.id)).size).toBe(VSCODE_CATALOG.length);
    expect(listCatalogThemes()).toBe(VSCODE_CATALOG);
  });

  it('every vendored theme converts to a valid preset matching its index entry', async () => {
    for (const entry of VSCODE_CATALOG) {
      const result = await loadCatalogTheme(entry.id);
      expect(result.error, entry.file).toBeUndefined();
      const preset = result.preset!;
      expect(validateThemePreset(preset), entry.file).toEqual([]);
      expect(preset.id, entry.file).toBe(entry.id);
      expect(preset.name, entry.file).toBe(entry.displayName);
      expect(preset.mode, entry.file).toBe(entry.type);
      expect(entry.swatch, entry.file).toEqual({
        bg: preset.background,
        fg: preset.foreground,
        accent: preset.accent,
      });
    }
  });

  it('every converted preset meets the anchor floors', async () => {
    for (const entry of VSCODE_CATALOG) {
      const { preset } = await loadCatalogTheme(entry.id);
      expect(
        contrastRatio(preset!.foreground, preset!.background),
        entry.file,
      ).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(preset!.accent, preset!.background), entry.file).toBeGreaterThanOrEqual(
        3,
      );
    }
  });

  it('unknown ids fail gracefully', async () => {
    expect((await loadCatalogTheme('nope')).error).toBeTruthy();
  });
});
