import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { deriveThemeTokens } from './engine';
import { deriveHfTokens, HF_TOKEN_NAMES } from './hf-mapping';
import { contrastRatio } from './color';

const HEX = /^#[0-9a-f]{6}$/;
const RGBA = /^rgba\(\d+, \d+, \d+, (0|1|0?\.\d+)\)$/;

/**
 * Not colours, so not the mapping's job: font vars are owned by applyFonts(),
 * and the icon opacities are theme-independent constants in theme.css.
 */
const NON_COLOR_VARS = new Set([
  '--hf-font-family',
  '--hf-font-size',
  '--hf-editor-font-family',
  '--hf-editor-font-size',
  '--hf-editor-font-size-base',
  '--hf-icon-opacity',
  '--hf-icon-opacity-hover',
  '--hf-icon-opacity-active',
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name === 'webview-dist') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(svelte|ts|css)$/.test(name) && !name.endsWith('.test.ts')) out.push(p);
  }
  return out;
}

/** Every --hf-* name a component or stylesheet reads via var(). */
function referencedHfVars(): Set<string> {
  const roots = [resolve(__dirname, '../..'), resolve(__dirname, '../../../../desktop/src')];
  const names = new Set<string>();
  for (const root of roots) {
    for (const file of walk(root)) {
      const text = readFileSync(file, 'utf8');
      for (const m of text.matchAll(/var\((--hf-[a-zA-Z0-9-]+)/g)) names.add(m[1]);
    }
  }
  return names;
}

const NORD = deriveThemeTokens(
  { accent: '#88c0d0', background: '#2e3440', foreground: '#d8dee9', contrast: 50 },
  'dark',
);
const LATTE = deriveThemeTokens(
  { accent: '#1e66f5', background: '#eff1f5', foreground: '#4c4f69', contrast: 50 },
  'light',
);

describe('deriveHfTokens', () => {
  it('covers every --hf-* variable referenced in @nouto/ui and the desktop app', () => {
    const referenced = [...referencedHfVars()].filter((n) => !NON_COLOR_VARS.has(n)).sort();
    const emitted = new Set(HF_TOKEN_NAMES);
    const missing = referenced.filter((n) => !emitted.has(n));
    expect(missing, `mapping is missing: ${missing.join(', ')}`).toEqual([]);
    // Sanity: the grep actually found the real inventory, not an empty dir.
    expect(referenced.length).toBeGreaterThan(100);
  });

  it('emits only well-formed CSS colour values', () => {
    for (const [sd, mode] of [
      [NORD, 'dark'],
      [LATTE, 'light'],
    ] as const) {
      const hf = deriveHfTokens(sd, mode);
      for (const [name, value] of Object.entries(hf)) {
        const ok = HEX.test(value) || RGBA.test(value) || value === 'transparent';
        expect(ok, `${name} = ${value}`).toBe(true);
      }
    }
  });

  it('keeps the anchors verbatim on the vars that are the anchors', () => {
    const hf = deriveHfTokens(NORD, 'dark');
    expect(hf['--hf-editor-background']).toBe('#2e3440');
    expect(hf['--hf-button-background']).toBe('#88c0d0');
    expect(hf['--hf-focusBorder']).toBe(NORD['border-focus']);
  });

  it('keeps text readable against the surfaces it sits on', () => {
    for (const [sd, mode] of [
      [NORD, 'dark'],
      [LATTE, 'light'],
    ] as const) {
      const hf = deriveHfTokens(sd, mode);
      const surfaces = [
        hf['--hf-editor-background'],
        hf['--hf-sideBar-background'],
        hf['--hf-editorWidget-background'],
        hf['--hf-input-background'],
      ];
      for (const bg of surfaces) {
        expect(contrastRatio(hf['--hf-foreground'], bg)).toBeGreaterThanOrEqual(4.5);
      }
      expect(
        contrastRatio(hf['--hf-button-foreground'], hf['--hf-button-background']),
      ).toBeGreaterThanOrEqual(3);
    }
  });

  it('gives the semantic families distinct hues', () => {
    const hf = deriveHfTokens(NORD, 'dark');
    const distinct = new Set([
      hf['--hf-charts-blue'],
      hf['--hf-charts-green'],
      hf['--hf-charts-orange'],
      hf['--hf-charts-purple'],
      hf['--hf-charts-red'],
      hf['--hf-charts-yellow'],
    ]);
    expect(distinct.size).toBe(6);
  });

  it('passes rgba overrides through the alpha helper untouched', () => {
    const sd = { ...NORD, hover: 'rgba(1, 2, 3, 0.5)' };
    expect(deriveHfTokens(sd, 'dark')['--hf-list-hoverBackground']).toBe('rgba(1, 2, 3, 0.5)');
  });
});
