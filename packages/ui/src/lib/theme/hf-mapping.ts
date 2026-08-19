// Maps the engine's 38 --sd-* tokens onto the ~150 --hf-* variables that
// every @nouto/ui component reads. This is Nouto-specific glue, not part of
// the ported engine: theme.css bridges --hf-* to --vscode-* for the VS Code
// extension, and the 27 built-in desktop themes set --hf-* from static CSS.
// Engine-backed (custom) themes take this path instead and land as inline
// styles on <html>, which win the cascade over theme.css's :root fallbacks.
//
// Three tiers of mapping:
//   1. Direct alias      — an --hf-* var is exactly an sd token.
//   2. Composed          — an alpha wash or an extra surface step derived
//                          from an sd token or the bg anchor.
//   3. Extended hues     — symbol icons, charts, debug tokens, ANSI: fixed
//                          semantic hues rendered at the accent's
//                          lightness/chroma, the way the engine builds
//                          success/warning/danger.
//
// Font variables (--hf-font-*, --hf-editor-font-*) are deliberately absent:
// applyFonts() in the theme store owns them for built-in and custom themes
// alike.

import { clampChroma, hexToOklch, hexToRgb, oklchToHex, splitAlphaHex } from './color';
import { TOKEN_NAMES, type ThemeTokens, type ThemeVariantMode } from './engine';

export type HfTokens = Record<string, string>;

/** Hue constants for the tier-3 swatches (OKLCH degrees). */
const HUES = {
  blue: 240,
  orange: 45,
  yellow: 75,
  string: 30,
} as const;

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/** Gamut-safe OKLCH → hex (mirrors the engine's private `mk`). */
function mk(l0: number, c: number, h: number): string {
  const l = clamp01(l0);
  return oklchToHex(l, clampChroma(l, c, h), h);
}

/**
 * `color` at `alpha` as an rgba() string. Non-hex inputs (an sd token that
 * is already rgba, or a raw CSS keyword) pass through untouched so an
 * override never gets mangled.
 */
function alpha(color: string, a: number): string {
  const split = splitAlphaHex(color);
  if (!split) return color;
  const [r, g, b] = hexToRgb(split.hex6);
  return `rgba(${r}, ${g}, ${b}, ${+(a * split.alpha).toFixed(3)})`;
}

/**
 * Derive the full --hf-* map for one engine token set.
 *
 * `sd` is the output of deriveThemeTokens for the preset; `mode` is the
 * preset's mode. `bg-base`, `text` and `accent` are always hex in an engine
 * output (the anchors), so the OKLCH work below is safe.
 */
export function deriveHfTokens(sd: ThemeTokens, mode: ThemeVariantMode): HfTokens {
  const bg = hexToOklch(sd['bg-base']);
  const fg = hexToOklch(sd.text);
  const accent = hexToOklch(sd.accent);
  const span = Math.max(Math.abs(fg[0] - bg[0]), 0.2);
  const dir = Math.sign(fg[0] - bg[0]) || (mode === 'dark' ? 1 : -1);

  /** A surface `f` of the bg→fg span away from the background. */
  const step = (f: number): string => mk(bg[0] + dir * f * span, bg[1], bg[2]);
  /** A tier-3 swatch: fixed hue at the accent's lightness and chroma. */
  const hue = (h: number): string => mk(accent[0], Math.max(accent[1], 0.08), h);

  const text = sd.text;
  const muted = sd['text-muted'];
  const dim = sd['text-dim'];
  const surface = sd['bg-surface'];
  const elevated = sd['bg-elevated'];
  const input = sd['bg-input'];
  const border = sd.border;
  const borderMuted = sd['border-muted'];
  const borderStrong = sd['border-strong'];
  const acc = sd.accent;
  const accHover = sd['accent-hover'];
  const accText = sd['accent-text'];
  const blue = hue(HUES.blue);
  const orange = hue(HUES.orange);
  const yellow = hue(HUES.yellow);
  const stringHue = hue(HUES.string);
  const shadowAlpha = mode === 'dark' ? 0.36 : 0.16;

  return {
    // === Badges ===
    '--hf-badge-background': acc,
    '--hf-badge-foreground': accText,

    // === Breadcrumb ===
    '--hf-breadcrumb-activeSelectionForeground': text,
    '--hf-breadcrumb-background': sd.hover,
    '--hf-breadcrumb-focusForeground': text,
    '--hf-breadcrumb-foreground': muted,

    // === Buttons ===
    '--hf-button-background': acc,
    '--hf-button-border': 'transparent',
    '--hf-button-foreground': accText,
    '--hf-button-hoverBackground': accHover,
    '--hf-button-secondaryBackground': step(0.2),
    '--hf-button-secondaryForeground': text,
    '--hf-button-secondaryHoverBackground': step(0.28),

    // === Charts ===
    '--hf-charts-blue': blue,
    '--hf-charts-green': sd.success,
    '--hf-charts-orange': orange,
    '--hf-charts-purple': sd.important,
    '--hf-charts-red': sd.danger,
    '--hf-charts-yellow': sd.warning,

    // === Debug Token Expressions ===
    '--hf-debugTokenExpression-boolean': blue,
    '--hf-debugTokenExpression-number': sd.success,
    '--hf-debugTokenExpression-string': stringHue,
    '--hf-debugTokenExpression-value': text,

    // === Diff Editor ===
    '--hf-diffEditor-diagonalFill': alpha(sd.warning, 0.15),
    '--hf-diffEditor-insertedTextBackground': alpha(sd.success, 0.2),
    '--hf-diffEditor-removedTextBackground': alpha(sd.danger, 0.2),

    // === Description ===
    '--hf-descriptionForeground': muted,

    // === Dropdown ===
    '--hf-dropdown-background': input,
    '--hf-dropdown-border': border,
    '--hf-dropdown-foreground': text,

    // === Editor ===
    '--hf-editorGroupHeader-tabsBackground': surface,
    '--hf-editorGroupHeader-tabsBorder': borderMuted,
    '--hf-editor-background': sd['bg-base'],
    '--hf-editor-foreground': text,
    '--hf-editor-findMatchBackground': alpha(acc, 0.35),
    '--hf-editor-findMatchHighlightBackground': alpha(sd.warning, 0.25),
    '--hf-editor-findMatchBorder': sd.warning,
    '--hf-editor-lineHighlightBackground': sd['editor-active-line'],
    '--hf-editor-selectionBackground': sd.selection,
    '--hf-editorBracketMatch-background': sd['editor-bracket-match'],
    '--hf-editorBracketMatch-border': acc,
    '--hf-editorCursor-foreground': text,
    '--hf-editorError-foreground': sd.danger,
    '--hf-editorHoverWidget-background': elevated,
    '--hf-editorHoverWidget-border': border,
    '--hf-editorHoverWidget-foreground': text,
    '--hf-editorInfo-background': sd['info-bg'],
    '--hf-editorInfo-border': sd.info,
    '--hf-editorInfo-foreground': sd.info,
    '--hf-editorLineNumber-activeForeground': text,
    '--hf-editorLineNumber-foreground': dim,
    '--hf-editorWarning-foreground': sd.warning,
    '--hf-editorWidget-background': elevated,
    '--hf-editorWidget-border': border,
    '--hf-editorWidget-foreground': text,

    // === Errors / Focus / Foreground ===
    '--hf-errorForeground': sd.danger,
    '--hf-focusBorder': sd['border-focus'],
    '--hf-foreground': text,

    // === Git Decoration ===
    '--hf-gitDecoration-addedResourceForeground': sd.success,
    '--hf-gitDecoration-deletedResourceForeground': sd.danger,
    '--hf-gitDecoration-modifiedResourceForeground': sd.warning,

    // === Icon ===
    '--hf-icon-foreground': text,

    // === Quick Input ===
    '--hf-quickInput-background': elevated,

    // === Input ===
    '--hf-input-background': input,
    '--hf-input-border': border,
    '--hf-input-foreground': text,
    '--hf-input-placeholderForeground': dim,
    '--hf-inputOption-activeBackground': alpha(acc, 0.3),
    '--hf-inputOption-activeBorder': acc,
    '--hf-inputOption-activeForeground': text,
    '--hf-inputOption-hoverBackground': sd.hover,
    '--hf-inputValidation-errorBackground': sd['danger-bg'],
    '--hf-inputValidation-errorBorder': sd.danger,
    '--hf-inputValidation-errorForeground': sd.danger,
    '--hf-inputValidation-warningBackground': sd['warning-bg'],
    '--hf-inputValidation-warningBorder': sd.warning,

    // === Checkbox ===
    '--hf-checkbox-border': borderStrong,

    // === Keybinding Label ===
    '--hf-keybindingLabel-background': alpha(muted, 0.15),
    '--hf-keybindingLabel-border': border,
    '--hf-keybindingLabel-foreground': text,

    // === List ===
    '--hf-list-activeSelectionBackground': sd.active,
    '--hf-list-activeSelectionForeground': text,
    '--hf-list-dropBackground': sd['accent-bg'],
    '--hf-list-hoverBackground': sd.hover,
    '--hf-list-highlightForeground': acc,
    '--hf-list-highlightBackground': alpha(sd.warning, 0.2),

    // === Menu ===
    '--hf-menu-background': elevated,
    '--hf-menu-border': border,
    '--hf-menu-foreground': text,
    '--hf-menu-selectionBackground': sd.active,
    '--hf-menu-selectionForeground': text,
    '--hf-menu-separatorBackground': border,

    // === Notifications ===
    '--hf-notifications-background': elevated,
    '--hf-notifications-border': border,
    '--hf-notifications-foreground': text,
    '--hf-notificationsInfoIcon-foreground': sd.info,
    '--hf-notificationsWarningIcon-foreground': sd.warning,

    // === Panel ===
    '--hf-panel-border': border,

    // === Progress Bar ===
    '--hf-progressBar-background': acc,

    // === Status Bar ===
    '--hf-statusBar-background': acc,
    '--hf-statusBar-foreground': accText,

    // === Scrollbar (overlay washes of the text colour, like the built-ins) ===
    '--hf-scrollbarSlider-background': alpha(text, 0.14),
    '--hf-scrollbarSlider-hoverBackground': alpha(text, 0.24),
    '--hf-scrollbarSlider-activeBackground': alpha(text, 0.34),

    // === Sidebar ===
    '--hf-sideBar-background': surface,
    '--hf-sideBar-border': borderMuted,
    '--hf-sideBar-foreground': text,
    '--hf-sideBarSectionHeader-background': alpha(text, 0.08),
    '--hf-sideBarSectionHeader-foreground': text,
    '--hf-sideBarTitle-foreground': text,

    // === Suggest Widget ===
    '--hf-editorSuggestWidget-background': elevated,
    '--hf-editorSuggestWidget-border': border,
    '--hf-editorSuggestWidget-foreground': text,
    '--hf-editorSuggestWidget-focusHighlightForeground': acc,
    '--hf-editorSuggestWidget-highlightForeground': acc,
    '--hf-editorSuggestWidget-selectedBackground': sd.active,
    '--hf-editorSuggestWidget-selectedForeground': text,

    // === Symbol Icons ===
    '--hf-symbolIcon-classForeground': yellow,
    '--hf-symbolIcon-enumeratorMemberForeground': blue,
    '--hf-symbolIcon-fieldForeground': blue,
    '--hf-symbolIcon-functionForeground': sd.important,
    '--hf-symbolIcon-methodForeground': sd.important,
    '--hf-symbolIcon-propertyForeground': blue,
    '--hf-symbolIcon-stringForeground': stringHue,
    '--hf-symbolIcon-typeParameterForeground': blue,
    '--hf-symbolIcon-variableForeground': blue,

    // === Tabs ===
    '--hf-tab-activeBackground': sd['bg-base'],
    '--hf-tab-activeBorderTop': acc,
    '--hf-tab-activeForeground': text,
    '--hf-tab-border': borderMuted,
    '--hf-tab-hoverBackground': sd.hover,
    '--hf-tab-inactiveBackground': surface,
    '--hf-tab-inactiveForeground': muted,

    // === Terminal ===
    '--hf-terminal-ansiBlue': blue,
    '--hf-terminal-ansiGreen': sd.success,
    '--hf-terminal-ansiRed': sd.danger,
    '--hf-terminal-ansiYellow': sd.warning,
    '--hf-terminal-background': sd['bg-base'],
    '--hf-terminal-foreground': text,

    // === Testing ===
    '--hf-testing-iconFailed': sd.danger,
    '--hf-testing-iconPassed': sd.success,

    // === Text ===
    '--hf-textBlockQuote-background': alpha(muted, 0.1),
    '--hf-textBlockQuote-border': acc,
    '--hf-textCodeBlock-background': input,
    '--hf-textLink-activeForeground': accHover,
    '--hf-textLink-foreground': acc,
    '--hf-textPreformat-foreground': orange,

    // === Title Bar ===
    '--hf-titleBar-activeBackground': surface,
    '--hf-titleBar-activeForeground': text,

    // === Toolbar ===
    '--hf-toolbar-activeBackground': sd.active,
    '--hf-toolbar-hoverBackground': sd.hover,

    // === Widget ===
    '--hf-widget-border': border,
    '--hf-widget-shadow': `rgba(0, 0, 0, ${shadowAlpha})`,
  };
}

/** Every --hf-* name deriveHfTokens emits (stable, for clearing and tests). */
export const HF_TOKEN_NAMES: readonly string[] = Object.keys(
  deriveHfTokens(
    // Any valid token set works; only the keys are read.
    Object.fromEntries(TOKEN_NAMES.map((k) => [k, '#000000'])) as ThemeTokens,
    'dark',
  ),
);
