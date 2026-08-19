import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import type { Extension } from '@codemirror/state';

/**
 * Detect whether the VS Code webview is using a dark theme
 * by reading the --hf-editor-background CSS variable.
 */
export function isVscodeDark(): boolean {
  if (typeof document === 'undefined') return true;
  const hex = getComputedStyle(document.body)
    .getPropertyValue('--hf-editor-background')
    .trim();
  if (hex && hex.startsWith('#') && hex.length >= 7) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return (r * 299 + g * 587 + b * 114) / 1000 < 128;
  }
  return true;
}

/**
 * Create the editor chrome theme (gutters, backgrounds, panels, etc.).
 * Uses VS Code CSS variables which adapt to any theme automatically.
 * The `dark` flag tells CodeMirror which highlight style to activate.
 */
export function createVscodeTheme(isDark: boolean) {
  return EditorView.theme({
    '&': {
      backgroundColor: 'transparent',
      color: 'var(--hf-editor-foreground, #d4d4d4)',
      fontSize: 'var(--hf-editor-font-size, 13px)',
      fontFamily: 'var(--hf-editor-font-family, Consolas, Monaco, monospace)',
    },
    '.cm-scroller': {
      fontFamily: 'var(--hf-editor-font-family, Consolas, Monaco, monospace)',
      fontSize: 'var(--hf-editor-font-size, 13px)',
      overflow: 'auto',
    },
    '.cm-content': {
      caretColor: 'var(--hf-editorCursor-foreground, #d4d4d4)',
      padding: '4px 0',
    },
    '.cm-gutters': {
      backgroundColor: 'transparent',
      color: 'var(--hf-editorLineNumber-foreground, #6e7681)',
      border: 'none',
      paddingRight: '8px',
    },
    '.cm-activeLineGutter': {
      color: 'var(--hf-editorLineNumber-activeForeground, #c6c6c6)',
      backgroundColor: 'transparent',
    },
    '.cm-activeLine': {
      backgroundColor: 'var(--hf-editor-lineHighlightBackground, rgba(128, 128, 128, 0.08))',
    },
    '.cm-foldPlaceholder': {
      backgroundColor: 'var(--hf-badge-background, #4d4d4d)',
      color: 'var(--hf-badge-foreground, #fff)',
      border: 'none',
      padding: '0 6px',
      borderRadius: '4px',
      fontSize: '10px',
      fontStyle: 'italic',
      margin: '0 4px',
      cursor: 'pointer',
    },
    '.cm-foldGutter .cm-gutterElement': {
      cursor: 'pointer',
      color: 'var(--hf-editorLineNumber-foreground, #6e7681)',
      fontSize: '12px',
      lineHeight: '1.5',
      textAlign: 'center',
      width: '16px',
    },
    '.cm-foldGutter .cm-gutterElement:hover': {
      color: 'var(--hf-editorLineNumber-activeForeground, #c6c6c6)',
    },
    '&.cm-focused': {
      outline: 'none',
    },
    '.cm-selectionBackground, ::selection': {
      backgroundColor: 'var(--hf-editor-selectionBackground, #264f78) !important',
    },
    '.cm-matchingBracket': {
      backgroundColor: 'var(--hf-editorBracketMatch-background, rgba(0, 100, 0, 0.3))',
      outline: '1px solid var(--hf-editorBracketMatch-border, #888)',
    },
    '.cm-searchMatch': {
      backgroundColor: 'var(--hf-editor-findMatchHighlightBackground, rgba(234, 92, 0, 0.33))',
    },
    '.cm-searchMatch.cm-searchMatch-selected': {
      backgroundColor: 'var(--hf-editor-findMatchBackground, rgba(81, 92, 106, 0.6))',
    },
    // ── Panel container ──────────────────────────────────────
    '.cm-panels': {
      backgroundColor: 'var(--hf-editorWidget-background, #252526)',
      color: 'var(--hf-editorWidget-foreground, #d4d4d4)',
    },
    '.cm-panels.cm-panels-top': {
      borderBottom: '1px solid var(--hf-editorWidget-border, rgba(127, 127, 127, 0.3))',
    },

    // ── Search form layout ───────────────────────────────────
    '.cm-panel.cm-search': {
      display: 'flex',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: '4px',
      padding: '6px 10px',
      position: 'relative',
      fontFamily: 'var(--hf-font-family, sans-serif)',
      fontSize: '12px',
    },
    '.cm-panel.cm-search br': {
      display: 'none',
    },

    // ── Text input fields ────────────────────────────────────
    '.cm-textfield': {
      backgroundColor: 'var(--hf-input-background, #3c3c3c)',
      color: 'var(--hf-input-foreground, #d4d4d4)',
      border: '1px solid var(--hf-input-border, rgba(127, 127, 127, 0.3))',
      borderRadius: '4px',
      padding: '4px 8px',
      fontSize: '12px',
      fontFamily: 'var(--hf-editor-font-family, Consolas, Monaco, monospace)',
      outline: 'none',
      lineHeight: '1.4',
      margin: '0',
    },
    '.cm-textfield:focus': {
      borderColor: 'var(--hf-focusBorder, #007fd4)',
    },
    '.cm-textfield::placeholder': {
      color: 'var(--hf-input-placeholderForeground, #888)',
    },

    // ── Action buttons (next, prev, all) ─────────────────────
    '.cm-button': {
      backgroundColor: 'var(--hf-button-secondaryBackground, #3a3d41)',
      color: 'var(--hf-button-secondaryForeground, #d4d4d4)',
      border: '1px solid transparent',
      borderRadius: '4px',
      padding: '3px 10px',
      fontSize: '11px',
      fontFamily: 'var(--hf-font-family, sans-serif)',
      cursor: 'pointer',
      lineHeight: '1.4',
      whiteSpace: 'nowrap',
      transition: 'background-color 0.1s',
      margin: '0',
    },
    '.cm-button:hover': {
      backgroundColor: 'var(--hf-button-secondaryHoverBackground, #45494e)',
    },
    '.cm-button:active': {
      backgroundColor: 'var(--hf-button-secondaryBackground, #3a3d41)',
      opacity: '0.8',
    },

    // ── Checkbox toggle labels (match case, regexp, by word) ─
    '.cm-panel.cm-search label': {
      display: 'inline-flex',
      alignItems: 'center',
      fontSize: '11px',
      fontFamily: 'var(--hf-font-family, sans-serif)',
      color: 'var(--hf-editorWidget-foreground, #d4d4d4)',
      border: '1px solid var(--hf-input-border, rgba(127, 127, 127, 0.3))',
      borderRadius: '4px',
      padding: '2px 7px',
      cursor: 'pointer',
      whiteSpace: 'nowrap',
      transition: 'background-color 0.1s, border-color 0.1s',
      margin: '0',
      userSelect: 'none',
      lineHeight: '1.4',
    },
    '.cm-panel.cm-search label:hover': {
      backgroundColor: 'var(--hf-toolbar-hoverBackground, rgba(127, 127, 127, 0.15))',
    },

    // ── Hide native checkbox, style label as toggle pill ─────
    '.cm-panel.cm-search input[type="checkbox"]': {
      appearance: 'none',
      width: '0',
      height: '0',
      margin: '0',
      padding: '0',
      border: 'none',
      position: 'absolute',
      opacity: '0',
      pointerEvents: 'none',
    },
    '.cm-panel.cm-search label:has(input:checked)': {
      backgroundColor: 'var(--hf-inputOption-activeBackground, rgba(0, 127, 212, 0.4))',
      borderColor: 'var(--hf-inputOption-activeBorder, var(--hf-focusBorder, #007fd4))',
      color: 'var(--hf-inputOption-activeForeground, #fff)',
    },

    // ── Close button (×) ────────────────────────────────────
    '.cm-panel.cm-search button[name="close"]': {
      position: 'static',
      marginLeft: 'auto',
      background: 'none',
      border: 'none',
      fontSize: '18px',
      cursor: 'pointer',
      padding: '2px 6px',
      lineHeight: '1',
      color: 'var(--hf-editorWidget-foreground, #d4d4d4)',
      opacity: '0.6',
      borderRadius: '4px',
      transition: 'opacity 0.1s, background-color 0.1s',
    },
    '.cm-panel.cm-search button[name="close"]:hover': {
      opacity: '1',
      backgroundColor: 'var(--hf-toolbar-hoverBackground, rgba(127, 127, 127, 0.15))',
    },
    // Lint: error squiggly underline
    '.cm-lintRange-error': {
      backgroundImage: 'none',
      textDecoration: 'wavy underline var(--hf-editorError-foreground, #f44747)',
      textDecorationSkipInk: 'none',
      textUnderlineOffset: '3px',
    },
    // Lint: gutter marker
    '.cm-lint-marker-error': {
      content: '"\\25CF"',
      color: 'var(--hf-editorError-foreground, #f44747)',
    },
    // Lint: diagnostic popup
    '.cm-diagnostic-error': {
      borderLeftColor: 'var(--hf-editorError-foreground, #f44747)',
    },
    '.cm-tooltip-lint': {
      backgroundColor: 'var(--hf-editorWidget-background, #252526)',
      color: 'var(--hf-editorWidget-foreground, #d4d4d4)',
      border: '1px solid var(--hf-editorWidget-border, #454545)',
      borderRadius: '4px',
      fontSize: '12px',
      fontFamily: 'var(--hf-editor-font-family, Consolas, Monaco, monospace)',
    },

    // ── Autocomplete popup ──────────────────────────────────
    '.cm-tooltip': {
      backgroundColor: 'var(--hf-editorSuggestWidget-background)',
      color: 'var(--hf-editorSuggestWidget-foreground)',
      border: '1px solid var(--hf-editorSuggestWidget-border)',
      borderRadius: '8px',
      boxShadow: '0 8px 24px var(--hf-widget-shadow, rgba(0, 0, 0, 0.24))',
      overflow: 'hidden',
    },
    '.cm-tooltip-autocomplete': {
      fontFamily: 'var(--hf-editor-font-family, Consolas, Monaco, monospace)',
      fontSize: '13px',
    },
    '.cm-tooltip-autocomplete > ul': {
      margin: '0',
      padding: '4px',
      maxHeight: '280px',
      listStyle: 'none',
    },
    // Thin scrollbar
    '.cm-tooltip-autocomplete > ul::-webkit-scrollbar': {
      width: '4px',
    },
    '.cm-tooltip-autocomplete > ul::-webkit-scrollbar-track': {
      background: 'transparent',
    },
    '.cm-tooltip-autocomplete > ul::-webkit-scrollbar-thumb': {
      background: 'var(--hf-scrollbarSlider-background)',
      borderRadius: '4px',
    },
    '.cm-tooltip-autocomplete > ul::-webkit-scrollbar-thumb:hover': {
      background: 'var(--hf-scrollbarSlider-hoverBackground)',
    },
    // Completion rows
    '.cm-tooltip-autocomplete li': {
      padding: '5px 10px !important',
      borderRadius: '5px',
      lineHeight: '1.45',
      cursor: 'pointer',
      margin: '1px 0',
    },
    '.cm-tooltip-autocomplete li[aria-selected]': {
      backgroundColor: 'var(--hf-editorSuggestWidget-selectedBackground)',
    },
    // Label
    '.cm-completionLabel': {
      flex: '1',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    },
    '.cm-completionMatchedText': {
      textDecoration: 'none',
      fontWeight: '600',
      color: 'var(--hf-editorSuggestWidget-highlightForeground)',
    },
    // Detail (namespace / type)
    '.cm-completionDetail': {
      fontStyle: 'italic',
      opacity: '0.5',
      fontSize: '11.5px',
      marginLeft: 'auto',
      paddingLeft: '16px',
      whiteSpace: 'nowrap',
    },
    // Info tooltip
    '.cm-completionInfo': {
      backgroundColor: 'var(--hf-editorSuggestWidget-background)',
      color: 'var(--hf-editorSuggestWidget-foreground)',
      border: '1px solid var(--hf-editorSuggestWidget-border)',
      borderRadius: '8px',
      boxShadow: '0 8px 24px var(--hf-widget-shadow, rgba(0, 0, 0, 0.24))',
      padding: '8px 14px',
      fontSize: '12px',
      fontFamily: 'var(--hf-editor-font-family, Consolas, Monaco, monospace)',
      maxWidth: '340px',
      lineHeight: '1.6',
      marginLeft: '4px',
    },
    // Type icon
    '.cm-completionIcon': {
      width: '18px',
      height: '18px',
      fontSize: '11px',
      lineHeight: '18px',
      textAlign: 'center',
      borderRadius: '4px',
      flexShrink: '0',
      marginRight: '2px',
    },
    '.cm-completionIcon-function': {
      color: 'var(--hf-symbolIcon-functionForeground)',
    },
    '.cm-completionIcon-function::after': {
      content: '"ƒ"',
    },
    '.cm-completionIcon-variable': {
      color: 'var(--hf-symbolIcon-variableForeground)',
    },
    '.cm-completionIcon-variable::after': {
      content: '"x"',
    },
    '.cm-minimap': {
      width: '60px',
      opacity: '0.6',
    },
    '.cm-minimap .cm-minimap-overlay': {
      backgroundColor: 'var(--hf-editor-selectionBackground, rgba(38, 79, 120, 0.3))',
    },
  }, { dark: isDark });
}

// Syntax colours come from the same --hf-* variables the rest of the UI uses,
// so one highlight style follows every theme: the 27 built-in CSS themes, any
// installed/imported VS Code theme (via hf-mapping.ts), and, inside the VS
// Code extension, the user's real VS Code theme (--vscode-symbolIcon-*,
// --vscode-debugTokenExpression-*, --vscode-terminal-ansi*). Fallbacks are
// the Dark+ palette. A var() in a HighlightStyle is plain CSS, so colours
// update live with no reconfigure.
const v = (name: string, fallback: string): string => `var(--hf-${name}, ${fallback})`;

const PROPERTY = v('symbolIcon-propertyForeground', '#9cdcfe');
const VARIABLE = v('symbolIcon-variableForeground', '#9cdcfe');
const STRING = v('debugTokenExpression-string', '#ce9178');
const NUMBER = v('debugTokenExpression-number', '#b5cea8');
const KEYWORD = v('debugTokenExpression-boolean', '#569cd6');
const CONTROL = v('symbolIcon-functionForeground', '#c586c0');
const FUNCTION = v('symbolIcon-functionForeground', '#dcdcaa');
const TYPE = v('symbolIcon-classForeground', '#4ec9b0');
const COMMENT = v('terminal-ansiGreen', '#6a9955');
const TEXT = v('editor-foreground', '#d4d4d4');
const MUTED = v('descriptionForeground', '#808080');
const LINK = v('textLink-foreground', '#3794ff');
const ERROR = v('errorForeground', '#d16969');
const ESCAPE = v('textPreformat-foreground', '#d7ba7d');
const HTML_TAG = v('terminal-ansiBlue', '#569cd6');
const HTML_ATTR = v('symbolIcon-propertyForeground', '#9cdcfe');

const themeHighlightStyle = HighlightStyle.define([
  // JSON / general tokens
  { tag: tags.propertyName, color: PROPERTY },
  { tag: tags.string, color: STRING },
  { tag: tags.number, color: NUMBER },
  { tag: tags.bool, color: KEYWORD },
  { tag: tags.null, color: KEYWORD },
  { tag: tags.punctuation, color: TEXT },

  // Keywords
  { tag: tags.keyword, color: KEYWORD },
  { tag: tags.controlKeyword, color: CONTROL },
  { tag: tags.operatorKeyword, color: KEYWORD },
  { tag: tags.definitionKeyword, color: KEYWORD },
  { tag: tags.moduleKeyword, color: CONTROL },

  // HTML/XML
  { tag: tags.tagName, color: HTML_TAG },
  { tag: tags.attributeName, color: HTML_ATTR },
  { tag: tags.attributeValue, color: STRING },
  { tag: tags.angleBracket, color: MUTED },
  { tag: tags.documentMeta, color: HTML_TAG },

  // Comments
  { tag: tags.comment, color: COMMENT },
  { tag: tags.lineComment, color: COMMENT },
  { tag: tags.blockComment, color: COMMENT },

  // Operators
  { tag: tags.operator, color: TEXT },
  { tag: tags.compareOperator, color: TEXT },
  { tag: tags.logicOperator, color: TEXT },

  // Functions and variables
  { tag: tags.function(tags.variableName), color: FUNCTION },
  { tag: tags.variableName, color: VARIABLE },
  { tag: tags.definition(tags.variableName), color: VARIABLE },
  { tag: tags.typeName, color: TYPE },
  { tag: tags.className, color: TYPE },
  { tag: tags.namespace, color: TYPE },

  // CSS-specific
  { tag: tags.atom, color: KEYWORD },
  { tag: tags.unit, color: NUMBER },
  { tag: tags.color, color: STRING },

  // Markdown-specific
  { tag: tags.heading, color: KEYWORD, fontWeight: 'bold' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strong, fontWeight: 'bold' },
  { tag: tags.link, color: LINK, textDecoration: 'underline' },
  { tag: tags.url, color: LINK },

  // Special
  { tag: tags.regexp, color: ERROR },
  { tag: tags.escape, color: ESCAPE },
  { tag: tags.special(tags.string), color: ESCAPE },
  { tag: tags.meta, color: KEYWORD },
  { tag: tags.processingInstruction, color: MUTED },
  { tag: tags.invalid, color: ERROR },
]);

/**
 * Watch for theme changes from every host: VS Code flips attributes on
 * <body>; the desktop app flips `data-theme` / `data-theme-mode` (and, for
 * engine themes, inline --hf-* styles) on <html>. Returns a teardown.
 */
export function observeThemeChanges(onChange: () => void): () => void {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return () => {};
  const observer = new MutationObserver(onChange);
  observer.observe(document.body, {
    attributes: true,
    attributeFilter: ['data-vscode-theme-kind', 'class'],
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme', 'data-theme-mode', 'style'],
  });
  return () => observer.disconnect();
}

/**
 * Returns theme + syntax highlighting extensions matching the current theme.
 */
export function getThemeExtensions(): Extension[] {
  // Only the chrome's `dark` flag depends on the resolved mode now; syntax
  // colours are CSS variables and follow the theme on their own.
  return [createVscodeTheme(isVscodeDark()), syntaxHighlighting(themeHighlightStyle)];
}
