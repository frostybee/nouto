// The 38-token theme derivation engine. Ported from the author's
// sarde-studio project (src/lib/theme/engine.js); the --sd-* namespace is
// kept so the engine and its tests survive verbatim.

import { hexToOklch, oklchToHex, hexToRgb, contrastRatio, clampChroma } from './color';

/** Every --sd-* suffix the engine emits. */
export const TOKEN_NAMES = [
  'bg-base',
  'bg-surface',
  'bg-elevated',
  'bg-input',
  'bg-overlay',
  'text',
  'text-muted',
  'text-dim',
  'accent',
  'accent-hover',
  'accent-bg',
  'accent-text',
  'border',
  'border-muted',
  'border-strong',
  'border-focus',
  'success',
  'success-bg',
  'warning',
  'warning-bg',
  'danger',
  'danger-bg',
  'important',
  'important-bg',
  'info',
  'info-bg',
  'hover',
  'active',
  'selection',
  'editor-active-line',
  'editor-bracket-match',
  'editor-flash',
  'scrollbar',
  'scrollbar-hover',
  'scrollbar-active',
  'shadow-sm',
  'shadow-md',
  'shadow-lg',
] as const;

export type TokenName = (typeof TOKEN_NAMES)[number];
export type ThemeTokens = Record<TokenName, string>;

/**
 * The four anchors (plus optional verbatim overrides) that a full token set
 * is derived from. `contrast` is 0-100 with 50 as the reference point.
 */
export interface ThemeAnchors {
  accent: string;
  background: string;
  foreground: string;
  contrast: number;
  overrides?: Partial<Record<TokenName, string>> | null;
}

export type ThemeVariantMode = 'light' | 'dark';

const SEMANTIC_HUES = { success: 145, warning: 80, danger: 25, important: 300 };
type ShadowTriple = [number, number, number];
const SHADOW_GEOMETRY: [string, string, string] = ['0 2px 8px', '0 4px 16px', '0 24px 64px'];
const SHADOW_ALPHA: { dark: ShadowTriple; light: ShadowTriple } = {
  dark: [0.25, 0.35, 0.45],
  light: [0.08, 0.1, 0.15],
};

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number): number => clamp(v, 0, 1);
const fmt = (v: number): number => +v.toFixed(3);

// Gamut-safe OKLCH → hex: lightness clamped, chroma reduced to the sRGB
// envelope.
const mk = (l0: number, c: number, h: number): string => {
  const l = clamp01(l0);
  return oklchToHex(l, clampChroma(l, c, h), h);
};

const rgba = (rgb: readonly number[], a: number): string =>
  `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${fmt(a)})`;

/**
 * Smallest lightness push toward `pole` that clears `floor` against every
 * backdrop. Measures the final (rounded) hex at each step so the guarantee
 * holds post-quantization. Returns the pole itself when even that cannot
 * reach the floor — graceful degradation, never throws.
 */
export function pushLForFloor(
  l0: number,
  c: number,
  h: number,
  backdrops: string[],
  floor: number,
  dir: number,
): string {
  const measure = (l: number): number =>
    Math.min(...backdrops.map((b) => contrastRatio(mk(l, c, h), b)));
  const start = clamp01(l0);
  if (measure(start) >= floor) return mk(start, c, h);
  const pole = dir > 0 ? 1 : 0;
  if (measure(pole) < floor) return mk(pole, c, h);
  let lo = start,
    hi = pole;
  for (let i = 0; i < 25; i++) {
    const mid = (lo + hi) / 2;
    if (measure(mid) >= floor) hi = mid;
    else lo = mid;
  }
  return mk(hi, c, h);
}

/**
 * Pure, deterministic derivation of the full --sd-* colour/shadow token set
 * from four anchors. `profile` is the resolved flat shape
 * { accent, background, foreground, contrast, overrides? } (hex anchors,
 * contrast 0-100, overrides an optional token→value map applied verbatim).
 */
export function deriveThemeTokens(profile: ThemeAnchors, mode: ThemeVariantMode): ThemeTokens {
  const bg = hexToOklch(profile.background);
  const fg = hexToOklch(profile.foreground);
  const accent = hexToOklch(profile.accent);
  const accentRgb = hexToRgb(profile.accent);
  const contrast = clamp(profile.contrast ?? 50, 0, 100);
  const t = (contrast - 50) / 50;
  const span = Math.max(Math.abs(fg[0] - bg[0]), 0.2);
  // Direction of "more prominent" is inferred from the anchors; the mode
  // default only breaks the tie for pathological bg === fg input.
  const dir = Math.sign(fg[0] - bg[0]) || (mode === 'dark' ? 1 : -1);
  const k = (gain: number): number => clamp(1 + t * gain, 0.3, 1.9);

  // Foreground family: fg's hue throughout, chroma tapering toward the bg
  // pole.
  const famC = (frac: number): number => fg[1] * (0.5 + 0.5 * frac);

  const semantic = (hue: number): string => mk(accent[0], accent[1], hue);
  const success = semantic(SEMANTIC_HUES.success);
  const warning = semantic(SEMANTIC_HUES.warning);
  const danger = semantic(SEMANTIC_HUES.danger);
  const important = semantic(SEMANTIC_HUES.important);
  const semBg = (hex: string): string => rgba(hexToRgb(hex), 0.1 * k(0.2));

  const scroll = (f: number): string => mk(bg[0] + dir * f * span * k(0.5), bg[1], bg[2]);
  const shadow = (i: 0 | 1 | 2): string =>
    `${SHADOW_GEOMETRY[i]} rgba(0, 0, 0, ${fmt(
      clamp(SHADOW_ALPHA[mode === 'dark' ? 'dark' : 'light'][i] * k(0.2), 0.04, 0.65),
    )})`;

  const tokens: ThemeTokens = {
    'bg-base': profile.background,
    'bg-surface': mk(bg[0] + dir * 0.05 * span * k(0.5), bg[1], bg[2]),
    'bg-elevated': mk(bg[0] + dir * 0.1 * span * k(0.5), bg[1] * 1.2, bg[2]),
    // Recessed well: always darker than base, in both modes.
    'bg-input': mk(bg[0] - 0.08 * span * k(0.4), bg[1], bg[2]),
    // Scrims always dim toward black, never mode-flipped.
    'bg-overlay': `rgba(0, 0, 0, ${fmt(
      clamp((mode === 'dark' ? 0.55 : 0.35) * k(0.2), 0.15, 0.75),
    )})`,
    text: profile.foreground,
    'text-muted': profile.foreground,
    'text-dim': mk(bg[0] + dir * 0.3 * span * k(0.3), famC(0.3), fg[2]),
    accent: profile.accent,
    'accent-hover': mk(accent[0] + dir * 0.05 * k(0.2), accent[1] * 0.9, accent[2]),
    'accent-bg': rgba(accentRgb, clamp(0.12 * k(0.25), 0.04, 0.24)),
    // Text on accent: whichever anchor reads better, never an invented
    // colour.
    'accent-text':
      contrastRatio(profile.background, profile.accent) >=
      contrastRatio(profile.foreground, profile.accent)
        ? profile.background
        : profile.foreground,
    border: mk(bg[0] + dir * 0.12 * span * k(0.5), bg[1], bg[2]),
    // Border hierarchy: muted at half of border's offset (subtle dividers),
    // strong at text-dim's 0.3 offset (hover/emphasis, decorative — no
    // floor).
    'border-muted': mk(bg[0] + dir * 0.06 * span * k(0.5), bg[1], bg[2]),
    'border-strong': mk(bg[0] + dir * 0.3 * span * k(0.5), bg[1], bg[2]),
    'border-focus': profile.accent,
    success,
    'success-bg': semBg(success),
    warning,
    'warning-bg': semBg(warning),
    danger,
    'danger-bg': semBg(danger),
    important,
    'important-bg': semBg(important),
    info: profile.accent,
    'info-bg': rgba(accentRgb, 0.1 * k(0.2)),
    hover: rgba(dir > 0 ? [255, 255, 255] : [0, 0, 0], 0.05 * k(0.25)),
    active: rgba(accentRgb, 0.1 * k(0.25)),
    selection: rgba(accentRgb, 0.18 * k(0.25)),
    // Interaction affordances inside an editor view — same k(0.25) gain
    // family as hover/active/selection. editor-flash is a search-jump line
    // flash: warning-hued, faded to transparent by CSS animation.
    'editor-active-line': rgba(accentRgb, clamp(0.08 * k(0.25), 0.03, 0.16)),
    'editor-bracket-match': rgba(accentRgb, clamp(0.25 * k(0.25), 0.12, 0.4)),
    'editor-flash': rgba(hexToRgb(warning), clamp(0.4 * k(0.25), 0.2, 0.6)),
    scrollbar: scroll(0.28),
    'scrollbar-hover': scroll(0.48),
    'scrollbar-active': scroll(0.68),
    'shadow-sm': shadow(0),
    'shadow-md': shadow(1),
    'shadow-lg': shadow(2),
  };

  // Preset overrides land verbatim — an author's explicit choice is never
  // corrected.
  const overrides = profile.overrides;
  if (overrides) Object.assign(tokens, overrides);

  // Accessibility floors, applied only to derived (non-overridden) guarded
  // tokens.
  const backdrops = [tokens['bg-base'], tokens['bg-surface'], tokens['bg-elevated']].filter((v) =>
    v.startsWith('#'),
  );
  const own = (key: TokenName): boolean => !overrides || !(key in overrides);
  if (own('text')) tokens.text = pushLForFloor(fg[0], famC(1), fg[2], backdrops, 4.5, dir);
  if (own('text-muted'))
    tokens['text-muted'] = pushLForFloor(
      bg[0] + dir * 0.62 * span * k(0.35),
      famC(0.62),
      fg[2],
      backdrops,
      4.5,
      dir,
    );
  if (own('border-focus'))
    tokens['border-focus'] = pushLForFloor(
      accent[0],
      accent[1],
      accent[2],
      [tokens['bg-base']],
      3,
      dir,
    );

  return tokens;
}
