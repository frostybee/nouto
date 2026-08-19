// Converts a VS Code / Shiki theme (they share the TextMate JSON format)
// into a ThemePreset: the workbench colors the theme defines are pinned
// verbatim as overrides — max fidelity — and the engine derives everything
// else. Ported from the author's sarde-studio project
// (src/lib/theme/vscode-import.js), minus the 12-key syntax palette; the
// TextMate keyword scope is still scanned because it is the accent fallback.
//
// Fidelity note: text, text-muted, and border-focus MUST be pinned whenever
// a source value exists, because deriveThemeTokens re-derives them through an
// OKLCH round-trip unless they appear in overrides (the own() gate).

import {
  splitAlphaHex,
  compositeOver,
  contrastRatio,
  relativeLuminance,
  hexToRgb,
  hexToOklch,
} from './color';
import { slugify } from './slugify';
import { validateThemePreset, type ThemePreset } from './schema';
import { validateAnchorEdit } from './anchor-validation';
import { pushLForFloor, type ThemeVariantMode, type TokenName } from './engine';

interface VsCodeTheme {
  name?: unknown;
  displayName?: unknown;
  type?: unknown;
  include?: unknown;
  colors?: Record<string, unknown>;
  tokenColors?: unknown;
}

export type ConvertResult =
  | { preset: ThemePreset; warnings: string[]; error?: undefined }
  | { error: string; preset?: undefined; warnings?: undefined };

/**
 * A VS Code theme has `colors` (object) and/or `tokenColors` (array); other
 * JSON shapes are rejected before conversion is attempted.
 */
export function isVsCodeTheme(parsed: unknown): parsed is VsCodeTheme {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
  const p = parsed as VsCodeTheme;
  const hasColors = p.colors && typeof p.colors === 'object' && !Array.isArray(p.colors);
  return !!(hasColors || Array.isArray(p.tokenColors));
}

// token → { candidates, policy }. Policies:
//   flatten — alpha-composite onto bg-base, opaque hex out (contexts that
//             need solid color, plus the own()-gated text/text-muted/
//             border-focus)
//   rgba    — preserve source alpha as an rgba() string (washes/selections)
// Tokens absent here (bg-overlay, accent-bg, accent-text, border-muted/
// strong, success-bg, important*, editor-flash, shadow-*) stay
// engine-derived: they have no reliable VS Code equivalent, or the engine's
// derivation (e.g. accent-text's contrast pick) is provably correct where a
// workbench guess is not.
export const WORKBENCH_CANDIDATES: Partial<
  Record<TokenName, { candidates: string[]; policy: 'flatten' | 'rgba' }>
> = {
  'bg-surface': {
    candidates: [
      'sideBar.background',
      'activityBar.background',
      'editorGroupHeader.tabsBackground',
    ],
    policy: 'flatten',
  },
  'bg-elevated': {
    candidates: [
      'editorWidget.background',
      'dropdown.background',
      'editorHoverWidget.background',
      'menu.background',
    ],
    policy: 'flatten',
  },
  'bg-input': {
    candidates: ['input.background', 'editorWidget.background'],
    policy: 'flatten',
  },
  'text-muted': {
    candidates: ['descriptionForeground', 'tab.inactiveForeground', 'editorLineNumber.foreground'],
    policy: 'flatten',
  },
  'text-dim': {
    candidates: ['disabledForeground', 'editorWhitespace.foreground'],
    policy: 'flatten',
  },
  'accent-hover': {
    candidates: ['button.hoverBackground', 'activityBarBadge.background'],
    policy: 'flatten',
  },
  border: {
    candidates: ['panel.border', 'editorGroup.border', 'sideBar.border', 'contrastBorder'],
    policy: 'flatten',
  },
  'border-focus': {
    candidates: ['focusBorder', 'contrastActiveBorder'],
    policy: 'flatten',
  },
  success: {
    candidates: [
      'gitDecoration.addedResourceForeground',
      'terminal.ansiGreen',
      'testing.iconPassed',
    ],
    policy: 'flatten',
  },
  warning: {
    candidates: ['editorWarning.foreground', 'list.warningForeground', 'terminal.ansiYellow'],
    policy: 'flatten',
  },
  danger: {
    candidates: [
      'editorError.foreground',
      'errorForeground',
      'list.errorForeground',
      'terminal.ansiRed',
    ],
    policy: 'flatten',
  },
  info: {
    candidates: ['editorInfo.foreground', 'terminal.ansiBlue', 'textLink.foreground'],
    policy: 'flatten',
  },
  'warning-bg': { candidates: ['editorWarning.background'], policy: 'rgba' },
  'danger-bg': { candidates: ['editorError.background'], policy: 'rgba' },
  'info-bg': { candidates: ['editorInfo.background'], policy: 'rgba' },
  hover: { candidates: ['list.hoverBackground'], policy: 'rgba' },
  active: {
    candidates: ['list.activeSelectionBackground', 'list.inactiveSelectionBackground'],
    policy: 'rgba',
  },
  selection: { candidates: ['editor.selectionBackground'], policy: 'rgba' },
  'editor-active-line': {
    candidates: ['editor.lineHighlightBackground'],
    policy: 'rgba',
  },
  'editor-bracket-match': {
    candidates: ['editorBracketMatch.background'],
    policy: 'rgba',
  },
  scrollbar: { candidates: ['scrollbarSlider.background'], policy: 'flatten' },
  'scrollbar-hover': {
    candidates: ['scrollbarSlider.hoverBackground'],
    policy: 'flatten',
  },
  'scrollbar-active': {
    candidates: ['scrollbarSlider.activeBackground'],
    policy: 'flatten',
  },
};

// TextMate scope-prefix candidates for the keyword colour, most specific
// first — the sole surviving entry of sarde's syntax scope table, kept
// because a theme's keyword colour is the accent fallback of last resort.
const KEYWORD_SCOPE_CANDIDATES = [
  'keyword.control',
  'keyword.operator.expression',
  'keyword.other',
  'storage.modifier',
  'keyword',
  'storage',
];

const colorAt = (
  colors: Record<string, unknown> | undefined,
  key: string,
): { hex6: string; alpha: number } | null => splitAlphaHex(colors?.[key]);

export function resolveBackground(parsed: VsCodeTheme): string | null {
  // Required root anchor. Alpha (pathological here) is dropped, not
  // composited — there is no backdrop under the root layer.
  return colorAt(parsed.colors, 'editor.background')?.hex6 ?? null;
}

export function resolveForeground(parsed: VsCodeTheme, bgHex: string): string {
  const fg = colorAt(parsed.colors, 'editor.foreground');
  if (fg) return fg.alpha < 1 ? compositeOver(fg.hex6, fg.alpha, bgHex) : fg.hex6;
  return contrastRatio('#ffffff', bgHex) >= contrastRatio('#000000', bgHex) ? '#ffffff' : '#000000';
}

export function resolveMode(parsed: VsCodeTheme, bgHex: string): ThemeVariantMode {
  const t = parsed.type;
  if (t === 'dark' || t === 'hc-dark') return 'dark';
  if (t === 'light' || t === 'hc-light') return 'light';
  return relativeLuminance(hexToRgb(bgHex)) > 0.5 ? 'light' : 'dark';
}

const ACCENT_CANDIDATES = [
  'focusBorder',
  'activityBarBadge.background',
  'button.background',
  'textLink.foreground',
];

function accentCandidates(
  parsed: VsCodeTheme,
  bgHex: string,
  keywordFallbackHex: string | null,
): string[] {
  const candidates = ACCENT_CANDIDATES.map((key) => colorAt(parsed.colors, key))
    .filter((c): c is { hex6: string; alpha: number } => c !== null)
    .map((c) => (c.alpha < 1 ? compositeOver(c.hex6, c.alpha, bgHex) : c.hex6));
  if (keywordFallbackHex) candidates.push(keywordFallbackHex);
  return candidates;
}

// Among candidates clearing the 3:1 floor, the most chromatic wins: themes
// routinely set focusBorder to a muted structural tone while the brand color
// lives in badge/button/link keys — chroma, not list order, identifies it
// (Dracula's pink vs its slate focusBorder).
const mostChromatic = (hexes: string[]): string | null =>
  hexes.reduce<string | null>(
    (best, hex) => (best == null || hexToOklch(hex)[1] > hexToOklch(best)[1] ? hex : best),
    null,
  );

export function resolveAccent(
  parsed: VsCodeTheme,
  bgHex: string,
  keywordFallbackHex: string | null = null,
): string | null {
  const passing = accentCandidates(parsed, bgHex, keywordFallbackHex).filter(
    (hex) => contrastRatio(hex, bgHex) >= 3,
  );
  return mostChromatic(passing);
}

// Hue-preserving lightness push to a contrast floor — the same mechanism the
// engine applies to its own derived tokens. Used when a theme's authentic
// color misses a floor: identity (hue/chroma) survives, readability wins,
// and the caller records a warning so the adjustment is never silent.
function adjustToFloor(hex: string, bgHex: string, floor: number, mode: ThemeVariantMode): string {
  const [l, c, h] = hexToOklch(hex);
  return pushLForFloor(l, c, h, [bgHex], floor, mode === 'dark' ? 1 : -1);
}

const toRgbaString = (hex6: string, alpha: number): string => {
  const [r, g, b] = hexToRgb(hex6);
  return `rgba(${r}, ${g}, ${b}, ${+alpha.toFixed(3)})`;
};

export function mapWorkbenchColors(
  colors: Record<string, unknown>,
  { backgroundHex }: { backgroundHex: string },
): Partial<Record<TokenName, string>> {
  const overrides: Partial<Record<TokenName, string>> = {};
  for (const [token, { candidates, policy }] of Object.entries(WORKBENCH_CANDIDATES) as [
    TokenName,
    { candidates: string[]; policy: 'flatten' | 'rgba' },
  ][]) {
    for (const key of candidates) {
      const c = colorAt(colors, key);
      if (!c) continue;
      overrides[token] =
        policy === 'rgba'
          ? c.alpha < 1
            ? toRgbaString(c.hex6, c.alpha)
            : c.hex6
          : c.alpha < 1
            ? compositeOver(c.hex6, c.alpha, backgroundHex)
            : c.hex6;
      break;
    }
  }
  return overrides;
}

/**
 * The theme's keyword colour, via prefix-at-dot-boundary scope matching;
 * among equally specific matches the last rule in file order wins (a
 * simplification of TextMate's cascade). Null when no rule contributes.
 */
export function resolveKeywordColor(tokenColors: unknown, backgroundHex: string): string | null {
  if (!Array.isArray(tokenColors)) return null;
  const rules: { scopes: string[]; hex: string }[] = [];
  for (const entry of tokenColors) {
    if (!entry || typeof entry !== 'object' || entry.scope == null) continue;
    const fg = splitAlphaHex(
      (entry as { settings?: { foreground?: unknown } }).settings?.foreground,
    );
    if (!fg) continue;
    const scopes = (Array.isArray(entry.scope) ? entry.scope : String(entry.scope).split(','))
      .map((s: unknown) => String(s).trim())
      .filter(Boolean);
    if (!scopes.length) continue;
    const hex = fg.alpha < 1 ? compositeOver(fg.hex6, fg.alpha, backgroundHex) : fg.hex6;
    rules.push({ scopes, hex });
  }
  const matches = (scope: string, candidate: string): boolean =>
    scope === candidate || scope.startsWith(candidate + '.');
  for (const candidate of KEYWORD_SCOPE_CANDIDATES) {
    let found: string | null = null;
    for (const rule of rules) {
      if (rule.scopes.some((s) => matches(s, candidate))) found = rule.hex;
    }
    if (found) return found;
  }
  return null;
}

export function convertVsCodeTheme(
  parsed: unknown,
  { fileName = '' }: { fileName?: string } = {},
): ConvertResult {
  if (!isVsCodeTheme(parsed)) return { error: 'Not a recognizable VS Code or Shiki theme.' };
  const warnings: string[] = [];
  if (parsed.include) {
    warnings.push(
      'This theme extends another file via "include" — only the colors defined here were imported, so the result may be incomplete.',
    );
  }

  const backgroundHex = resolveBackground(parsed);
  if (!backgroundHex) {
    return {
      error:
        'This theme has no "colors.editor.background" — there is nothing to build an app theme from.',
    };
  }
  const mode = resolveMode(parsed, backgroundHex);
  const keywordHex = resolveKeywordColor(parsed.tokenColors, backgroundHex);

  let foregroundHex = resolveForeground(parsed, backgroundHex);
  if (contrastRatio(foregroundHex, backgroundHex) < 4.5) {
    foregroundHex = adjustToFloor(foregroundHex, backgroundHex, 4.5, mode);
    warnings.push(
      'The theme’s text color misses the 4.5:1 readability floor and was nudged toward it (hue preserved).',
    );
  }

  let accentHex = resolveAccent(parsed, backgroundHex, keywordHex);
  if (!accentHex) {
    const raw = mostChromatic(accentCandidates(parsed, backgroundHex, keywordHex));
    if (!raw) {
      return { error: 'Could not find any theme color to use as the accent.' };
    }
    accentHex = adjustToFloor(raw, backgroundHex, 3, mode);
    warnings.push(
      'The theme’s accent color misses the 3:1 contrast floor and was nudged toward it (hue preserved).',
    );
  }

  const gate = validateAnchorEdit({
    accent: accentHex,
    background: backgroundHex,
    foreground: foregroundHex,
  });
  if (!gate.valid) return { error: gate.message };

  const overrides = mapWorkbenchColors(parsed.colors ?? {}, { backgroundHex });
  overrides['bg-base'] = backgroundHex;
  overrides.text = foregroundHex;
  overrides.accent = accentHex;

  const name =
    (typeof parsed.displayName === 'string' && parsed.displayName.trim()) ||
    (typeof parsed.name === 'string' && parsed.name.trim()) ||
    (fileName ? fileName.replace(/\.(json|jsonc)$/i, '') : '') ||
    'Imported Theme';
  const preset: ThemePreset = {
    id: slugify(name) || 'imported-theme',
    name,
    mode,
    accent: accentHex,
    background: backgroundHex,
    foreground: foregroundHex,
    contrast: 50,
    overrides,
  };

  const errors = validateThemePreset(preset);
  const firstError = errors[0];
  if (firstError !== undefined) return { error: firstError };
  return { preset, warnings };
}
