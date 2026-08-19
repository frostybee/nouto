import { describe, it, expect } from 'vitest';
import { deriveThemeTokens, TOKEN_NAMES, type ThemeAnchors } from './engine';
import { contrastRatio, oklchToHex } from './color';

const HEX = /^#[0-9a-f]{6}$/;
const RGBA = /^rgba\(\d+, \d+, \d+, 0?\.\d+\)$/;
const SHADOW = /^0 \d+px \d+px rgba\(0, 0, 0, 0?\.\d+\)$/;

const ALPHA_TOKENS = [
  'bg-overlay',
  'accent-bg',
  'success-bg',
  'warning-bg',
  'danger-bg',
  'important-bg',
  'info-bg',
  'hover',
  'active',
  'selection',
  'editor-active-line',
  'editor-bracket-match',
  'editor-flash',
];
const SHADOW_TOKENS = ['shadow-sm', 'shadow-md', 'shadow-lg'];
const OPAQUE_TOKENS = TOKEN_NAMES.filter(
  (n) => !ALPHA_TOKENS.includes(n) && !SHADOW_TOKENS.includes(n),
);

// Reference chromatic anchor sets (sarde-studio's Studio presets), kept as
// engine fixtures: they exercise the floors with a colored accent, which the
// template's neutral Default preset deliberately does not.
const REFERENCE_DARK: ThemeAnchors = {
  accent: '#5b8eef',
  background: '#17181c',
  foreground: '#e9eaed',
  contrast: 50,
};
const REFERENCE_LIGHT: ThemeAnchors = {
  accent: '#3568d4',
  background: '#f7f7f8',
  foreground: '#1c1d21',
  contrast: 50,
};
const REFERENCES: ['dark' | 'light', ThemeAnchors][] = [
  ['dark', REFERENCE_DARK],
  ['light', REFERENCE_LIGHT],
];

// Programmatic anchor sweep: 5 accent hues x 3 contrast levels x 2 modes.
const sweep: { mode: 'dark' | 'light'; profile: ThemeAnchors }[] = [];
for (const mode of ['dark', 'light'] as const) {
  const background = mode === 'dark' ? oklchToHex(0.2, 0.01, 270) : oklchToHex(0.97, 0.005, 270);
  const foreground = mode === 'dark' ? oklchToHex(0.93, 0.005, 270) : oklchToHex(0.25, 0.01, 270);
  for (const hue of [25, 145, 200, 262, 330]) {
    const accent = oklchToHex(mode === 'dark' ? 0.66 : 0.54, 0.15, hue);
    for (const contrast of [0, 50, 100]) {
      sweep.push({
        mode,
        profile: { accent, background, foreground, contrast },
      });
    }
  }
}

const minTextContrast = (tokens: Record<string, string>, name: string): number =>
  Math.min(
    ...['bg-base', 'bg-surface', 'bg-elevated'].map((b) =>
      contrastRatio(tokens[name]!, tokens[b]!),
    ),
  );

describe('deriveThemeTokens determinism', () => {
  it('produces identical output for identical input', () => {
    for (const [mode, profile] of REFERENCES) {
      expect(deriveThemeTokens(profile, mode)).toEqual(deriveThemeTokens(profile, mode));
    }
    for (const { mode, profile } of sweep.slice(0, 6)) {
      expect(deriveThemeTokens(profile, mode)).toEqual(deriveThemeTokens(profile, mode));
    }
  });
});

describe('accessibility floors across the anchor sweep', () => {
  it('text and text-muted clear 4.5:1 against all three backgrounds', () => {
    for (const { mode, profile } of sweep) {
      const tokens = deriveThemeTokens(profile, mode);
      expect(minTextContrast(tokens, 'text')).toBeGreaterThanOrEqual(4.5);
      expect(minTextContrast(tokens, 'text-muted')).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('border-focus clears 3:1 against bg-base', () => {
    for (const { mode, profile } of sweep) {
      const tokens = deriveThemeTokens(profile, mode);
      expect(contrastRatio(tokens['border-focus'], tokens['bg-base'])).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('border hierarchy across the anchor sweep', () => {
  it('orders muted ≤ border ≤ strong in prominence against bg-base', () => {
    for (const { mode, profile } of sweep) {
      const tokens = deriveThemeTokens(profile, mode);
      const cr = (name: 'border-muted' | 'border' | 'border-strong'): number =>
        contrastRatio(tokens[name], tokens['bg-base']);
      expect(cr('border-muted')).toBeLessThanOrEqual(cr('border'));
      expect(cr('border')).toBeLessThanOrEqual(cr('border-strong'));
      expect(cr('border-strong')).toBeGreaterThan(cr('border-muted'));
    }
  });
});

describe('token formats across the anchor sweep', () => {
  it('emits every token in TOKEN_NAMES with the right value shape', () => {
    for (const { mode, profile } of sweep) {
      const tokens = deriveThemeTokens(profile, mode);
      for (const name of OPAQUE_TOKENS) expect(tokens[name]).toMatch(HEX);
      for (const name of ALPHA_TOKENS) expect(tokens[name as keyof typeof tokens]).toMatch(RGBA);
      for (const name of SHADOW_TOKENS) expect(tokens[name as keyof typeof tokens]).toMatch(SHADOW);
    }
  });
});

describe('preset overrides', () => {
  const base: ThemeAnchors = {
    accent: '#89b4fa',
    background: '#1e1e2e',
    foreground: '#cdd6f4',
    contrast: 50,
  };

  it('land verbatim even when they fail the floor', () => {
    // Catppuccin Mocha's real text-muted: 2.74:1 vs bg-elevated, below the
    // 4.5 floor.
    const tokens = deriveThemeTokens({ ...base, overrides: { 'text-muted': '#6c7086' } }, 'dark');
    expect(tokens['text-muted']).toBe('#6c7086');
    expect(minTextContrast(tokens, 'text-muted')).toBeLessThan(4.5);
  });

  it('are skipped by the clamp while non-overridden tokens still derive', () => {
    const derived = deriveThemeTokens(base, 'dark');
    const overridden = deriveThemeTokens(
      { ...base, overrides: { accent: '#ff0000', 'bg-surface': '#252536' } },
      'dark',
    );
    expect(overridden.accent).toBe('#ff0000');
    expect(overridden['bg-surface']).toBe('#252536');
    expect(overridden['text-dim']).toBe(derived['text-dim']);
    // text still floor-guarded against the overridden backdrop set
    expect(minTextContrast(overridden, 'text')).toBeGreaterThanOrEqual(4.5);
  });

  it('sanity: the unoverridden derivation differs from the pinned value', () => {
    const tokens = deriveThemeTokens(base, 'dark');
    expect(tokens['text-muted']).not.toBe('#6c7086');
  });
});

describe('reference anchors', () => {
  it.each(REFERENCES)('%s holds all floors at contrast 0/50/100', (mode, profile) => {
    for (const contrast of [0, 50, 100]) {
      const tokens = deriveThemeTokens({ ...profile, contrast }, mode);
      expect(minTextContrast(tokens, 'text')).toBeGreaterThanOrEqual(10);
      expect(minTextContrast(tokens, 'text-muted')).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(tokens['border-focus'], tokens['bg-base'])).toBeGreaterThanOrEqual(3);
    }
  });

  it('anchors pass through verbatim at reference contrast', () => {
    const tokens = deriveThemeTokens(REFERENCE_DARK, 'dark');
    expect(tokens['bg-base']).toBe(REFERENCE_DARK.background);
    expect(tokens.text).toBe(REFERENCE_DARK.foreground);
    expect(tokens.accent).toBe(REFERENCE_DARK.accent);
  });
});

describe('editor and important tokens', () => {
  const alphaOf = (value: string): number => parseFloat(value.match(/([\d.]+)\)$/)![1]!);

  it('editor overlay alphas stay within their clamps across the sweep', () => {
    for (const { mode, profile } of sweep) {
      const tokens = deriveThemeTokens(profile, mode);
      expect(alphaOf(tokens['editor-active-line'])).toBeGreaterThanOrEqual(0.03);
      expect(alphaOf(tokens['editor-active-line'])).toBeLessThanOrEqual(0.16);
      expect(alphaOf(tokens['editor-bracket-match'])).toBeGreaterThanOrEqual(0.12);
      expect(alphaOf(tokens['editor-bracket-match'])).toBeLessThanOrEqual(0.4);
      expect(alphaOf(tokens['editor-flash'])).toBeGreaterThanOrEqual(0.2);
      expect(alphaOf(tokens['editor-flash'])).toBeLessThanOrEqual(0.6);
    }
  });

  it('important forms a distinct semantic pair, overridable like the others', () => {
    const tokens = deriveThemeTokens(REFERENCE_DARK, 'dark');
    expect(tokens.important).toMatch(HEX);
    expect(tokens.important).not.toBe(tokens.danger);
    expect(tokens.important).not.toBe(tokens.info);
    const pinned = deriveThemeTokens(
      { ...REFERENCE_DARK, overrides: { important: '#a855f7' } },
      'dark',
    );
    expect(pinned.important).toBe('#a855f7');
  });
});

describe('edge cases', () => {
  it('bg === fg degrades gracefully via the mode fallback', () => {
    const profile: ThemeAnchors = {
      accent: '#5b8eef',
      background: '#101010',
      foreground: '#101010',
      contrast: 50,
    };
    const tokens = deriveThemeTokens(profile, 'dark');
    for (const name of TOKEN_NAMES) expect(tokens[name]).toBeTruthy();
    expect(JSON.stringify(tokens)).not.toMatch(/NaN/i);
    expect(minTextContrast(tokens, 'text')).toBeGreaterThanOrEqual(4.5);
  });

  it('contrast 0 with identical anchors stays floor-compliant', () => {
    const profile: ThemeAnchors = {
      accent: '#5b8eef',
      background: '#101010',
      foreground: '#101010',
      contrast: 0,
    };
    const tokens = deriveThemeTokens(profile, 'dark');
    expect(minTextContrast(tokens, 'text')).toBeGreaterThanOrEqual(4.5);
    expect(minTextContrast(tokens, 'text-muted')).toBeGreaterThanOrEqual(4.5);
  });

  it('zero-chroma accent derives clean neutrals', () => {
    const tokens = deriveThemeTokens({ ...REFERENCE_DARK, accent: '#888888' }, 'dark');
    expect(tokens['accent-hover']).toMatch(HEX);
    expect(tokens['border-focus']).toMatch(HEX);
    expect(tokens.success).toMatch(HEX);
  });

  it('near-white accent on dark passes focus floor untouched', () => {
    const tokens = deriveThemeTokens({ ...REFERENCE_DARK, accent: '#f5f5f0' }, 'dark');
    expect(tokens['border-focus']).toBe('#f5f5f0');
  });

  it('near-black background clips bg-input without breaking', () => {
    const tokens = deriveThemeTokens({ ...REFERENCE_DARK, background: '#050505' }, 'dark');
    expect(tokens['bg-input']).toMatch(HEX);
  });

  it('clamps out-of-range contrast input', () => {
    expect(deriveThemeTokens({ ...REFERENCE_DARK, contrast: -50 }, 'dark')).toEqual(
      deriveThemeTokens({ ...REFERENCE_DARK, contrast: 0 }, 'dark'),
    );
    expect(deriveThemeTokens({ ...REFERENCE_DARK, contrast: 200 }, 'dark')).toEqual(
      deriveThemeTokens({ ...REFERENCE_DARK, contrast: 100 }, 'dark'),
    );
  });
});
