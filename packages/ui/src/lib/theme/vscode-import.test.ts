import { describe, it, expect } from 'vitest';
import draculaRaw from './vscode-themes/dracula.json?raw';
import nordRaw from './vscode-themes/nord.json?raw';
import githubLightRaw from './vscode-themes/github-light-default.json?raw';
import {
  isVsCodeTheme,
  convertVsCodeTheme,
  resolveBackground,
  resolveForeground,
  resolveMode,
  resolveAccent,
  resolveKeywordColor,
  mapWorkbenchColors,
  WORKBENCH_CANDIDATES,
} from './vscode-import';
import { validateThemePreset } from './schema';
import { deriveThemeTokens } from './engine';
import { contrastRatio } from './color';

const loadTheme = (raw: string): unknown => JSON.parse(raw);

// Minimal well-formed dark theme for targeted cases.
interface MiniPatch {
  colors?: Record<string, string>;
  tokenColors?: unknown[];
  top?: Record<string, unknown>;
}
const miniTheme = (patch: MiniPatch = {}) => ({
  name: 'Mini',
  type: 'dark',
  colors: {
    'editor.background': '#1e1e2e',
    'editor.foreground': '#cdd6f4',
    focusBorder: '#89b4fa',
    ...patch.colors,
  },
  tokenColors: patch.tokenColors ?? [],
  ...patch.top,
});

describe('isVsCodeTheme', () => {
  it('recognizes colors and tokenColors shapes', () => {
    expect(isVsCodeTheme({ colors: {} })).toBe(true);
    expect(isVsCodeTheme({ tokenColors: [] })).toBe(true);
    expect(isVsCodeTheme(loadTheme(draculaRaw))).toBe(true);
  });

  it('rejects non-theme shapes', () => {
    expect(isVsCodeTheme(null)).toBe(false);
    expect(isVsCodeTheme([])).toBe(false);
    expect(isVsCodeTheme('{}')).toBe(false);
    expect(isVsCodeTheme({})).toBe(false);
  });
});

describe('resolveBackground', () => {
  it('requires editor.background and drops any alpha on it', () => {
    expect(resolveBackground(miniTheme())).toBe('#1e1e2e');
    expect(resolveBackground({ colors: { 'editor.background': '#1e1e2ecc' } })).toBe('#1e1e2e');
    expect(resolveBackground({ colors: {} })).toBeNull();
    expect(resolveBackground({ colors: { 'editor.background': 'rgb(1,2,3)' } })).toBeNull();
  });
});

describe('resolveForeground', () => {
  it('uses editor.foreground, compositing alpha over the background', () => {
    expect(resolveForeground(miniTheme(), '#1e1e2e')).toBe('#cdd6f4');
    const withAlpha = { colors: { 'editor.foreground': '#ffffff80' } };
    expect(resolveForeground(withAlpha, '#000000')).toBe('#808080');
  });

  it('falls back to the better-contrast pole when absent', () => {
    expect(resolveForeground({ colors: {} }, '#111111')).toBe('#ffffff');
    expect(resolveForeground({ colors: {} }, '#f5f5f5')).toBe('#000000');
  });
});

describe('resolveMode', () => {
  it.each([
    ['dark', 'dark'],
    ['light', 'light'],
    ['hc-dark', 'dark'],
    ['hc-light', 'light'],
  ])('maps type %s to %s', (type, mode) => {
    expect(resolveMode({ type }, '#808080')).toBe(mode);
  });

  it('infers from background luminance when type is absent', () => {
    expect(resolveMode({}, '#111111')).toBe('dark');
    expect(resolveMode({}, '#fafafa')).toBe('light');
  });
});

describe('resolveAccent', () => {
  it('prefers the most chromatic candidate that clears 3:1', () => {
    // Muted focusBorder passes but the vivid badge should win.
    const parsed = {
      colors: {
        focusBorder: '#746f77',
        'activityBarBadge.background': '#00b0ff',
      },
    };
    expect(resolveAccent(parsed, '#23262e')).toBe('#00b0ff');
  });

  it('falls back to the syntax keyword color', () => {
    expect(resolveAccent({ colors: {} }, '#1e1e2e', '#cba6f7')).toBe('#cba6f7');
  });

  it('returns null when nothing clears the floor', () => {
    expect(resolveAccent({ colors: { focusBorder: '#20222a' } }, '#1e1e2e')).toBeNull();
  });
});

describe('mapWorkbenchColors', () => {
  const ctx = { backgroundHex: '#1e1e2e' };

  it('honors candidate precedence', () => {
    const overrides = mapWorkbenchColors(
      {
        'sideBar.background': '#252536',
        'activityBar.background': '#303046',
      },
      ctx,
    );
    expect(overrides['bg-surface']).toBe('#252536');
    const fallback = mapWorkbenchColors({ 'activityBar.background': '#303046' }, ctx);
    expect(fallback['bg-surface']).toBe('#303046');
  });

  it('flattens alpha for opaque tokens and preserves it for washes', () => {
    const overrides = mapWorkbenchColors(
      {
        'sideBar.background': '#ffffff80', // flatten policy
        'list.hoverBackground': '#ffffff10', // rgba policy
        'editor.selectionBackground': '#89b4fa40', // rgba policy
        'scrollbarSlider.background': '#45475a80', // flatten policy
      },
      { backgroundHex: '#000000' },
    );
    expect(overrides['bg-surface']).toBe('#808080');
    expect(overrides.hover).toBe('rgba(255, 255, 255, 0.063)');
    expect(overrides.selection).toBe('rgba(137, 180, 250, 0.251)');
    expect(overrides.scrollbar).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('keeps opaque rgba-policy values as hex and skips non-hex values', () => {
    const overrides = mapWorkbenchColors(
      {
        'editor.selectionBackground': '#44475a',
        'panel.border': 'transparent',
      },
      ctx,
    );
    expect(overrides.selection).toBe('#44475a');
    expect(overrides.border).toBeUndefined();
  });

  it('only ever emits known token names', () => {
    const full = Object.fromEntries(
      Object.values(WORKBENCH_CANDIDATES).flatMap(({ candidates }) =>
        candidates.map((k) => [k, '#123456']),
      ),
    );
    const overrides = mapWorkbenchColors(full, ctx);
    expect(Object.keys(overrides).sort()).toEqual(Object.keys(WORKBENCH_CANDIDATES).sort());
  });
});

describe('resolveKeywordColor', () => {
  const bg = '#1e1e2e';

  it('resolves through candidate priorities, most specific first', () => {
    const hex = resolveKeywordColor(
      [
        { scope: 'keyword', settings: { foreground: '#ff79c6' } },
        { scope: 'keyword.control', settings: { foreground: '#cba6f7' } },
      ],
      bg,
    );
    expect(hex).toBe('#cba6f7'); // keyword.control beats plain keyword
  });

  it('lets the last equally-specific rule win', () => {
    const hex = resolveKeywordColor(
      [
        { scope: 'keyword.control', settings: { foreground: '#111111' } },
        { scope: 'keyword.control', settings: { foreground: '#6272a4' } },
      ],
      bg,
    );
    expect(hex).toBe('#6272a4');
  });

  it('normalizes comma-separated scopes, dot-boundary only', () => {
    expect(
      resolveKeywordColor(
        [{ scope: 'keywords', settings: { foreground: '#ff0000' } }], // not `keyword`
        bg,
      ),
    ).toBeNull();
    expect(
      resolveKeywordColor(
        [
          {
            scope: 'string, keyword.other',
            settings: { foreground: '#f1fa8c' },
          },
        ],
        bg,
      ),
    ).toBe('#f1fa8c');
  });

  it('composites alpha foregrounds over the background', () => {
    expect(
      resolveKeywordColor([{ scope: 'keyword', settings: { foreground: '#ffffff80' } }], '#000000'),
    ).toBe('#808080');
    expect(resolveKeywordColor(undefined, bg)).toBeNull();
  });
});

describe('convertVsCodeTheme', () => {
  it('converts Dracula with authentic pinned values', () => {
    const { preset, warnings } = convertVsCodeTheme(loadTheme(draculaRaw));
    expect(warnings).toEqual([]);
    expect(validateThemePreset(preset)).toEqual([]);
    expect(preset!.id).toBe('dracula-theme'); // upstream displayName is "Dracula Theme"
    expect(preset!.mode).toBe('dark');
    expect(preset!.background).toBe('#282a36');
    expect(preset!.foreground).toBe('#f8f8f2');
    expect(preset!.accent).toBe('#ff79c6'); // brand pink via chroma pick, not slate focusBorder
  });

  it('pins text/text-muted/border-focus byte-exactly through derivation (own() gate)', () => {
    for (const [file, raw] of [
      ['dracula.json', draculaRaw],
      ['nord.json', nordRaw],
      ['github-light-default.json', githubLightRaw],
    ] as const) {
      const { preset } = convertVsCodeTheme(loadTheme(raw));
      const derived = deriveThemeTokens(preset!, preset!.mode);
      expect(derived.text, file).toBe(preset!.overrides!.text);
      for (const token of ['text-muted', 'border-focus'] as const) {
        if (preset!.overrides![token])
          expect(derived[token], `${file} ${token}`).toBe(preset!.overrides![token]);
      }
      expect(derived['bg-base'], file).toBe(preset!.background);
    }
  });

  it('nudges a low-contrast foreground to the floor with a warning, preserving readability', () => {
    const theme = miniTheme({ colors: { 'editor.foreground': '#44475a' } });
    const { preset, warnings } = convertVsCodeTheme(theme);
    expect(warnings!.some((w) => w.includes('readability floor'))).toBe(true);
    expect(contrastRatio(preset!.foreground, preset!.background)).toBeGreaterThanOrEqual(4.5);
    expect(validateThemePreset(preset)).toEqual([]);
  });

  it('nudges an inaccessible accent to 3:1 with a warning', () => {
    const theme = miniTheme({ colors: { focusBorder: '#2a2c3d' } });
    const { preset, warnings } = convertVsCodeTheme(theme);
    expect(warnings!.some((w) => w.includes('contrast floor'))).toBe(true);
    expect(contrastRatio(preset!.accent, preset!.background)).toBeGreaterThanOrEqual(3);
  });

  it('errors actionably without editor.background', () => {
    const { error } = convertVsCodeTheme({ colors: {}, tokenColors: [] });
    expect(error).toContain('editor.background');
  });

  it('warns on include and names from displayName, name, then fileName', () => {
    const inc = convertVsCodeTheme(miniTheme({ top: { include: './base.json' } }));
    expect(inc.warnings!.some((w) => w.includes('include'))).toBe(true);
    expect(
      convertVsCodeTheme(miniTheme({ top: { displayName: 'Pretty Name' } })).preset!.name,
    ).toBe('Pretty Name');
    expect(convertVsCodeTheme(miniTheme()).preset!.name).toBe('Mini');
    const noName: Record<string, unknown> = miniTheme();
    delete noName.name;
    expect(convertVsCodeTheme(noName, { fileName: 'my-theme.json' }).preset!.name).toBe('my-theme');
    expect(convertVsCodeTheme(noName).preset!.name).toBe('Imported Theme');
  });
});
