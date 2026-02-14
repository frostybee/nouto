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
      fontSize: '12px',
      fontFamily: 'var(--hf-editor-font-family, Consolas, Monaco, monospace)',
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
    '.cm-scroller': {
      overflow: 'auto',
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
      content: '"●"',
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
    '.cm-minimap': {
      width: '60px',
      opacity: '0.6',
    },
    '.cm-minimap .cm-minimap-overlay': {
      backgroundColor: 'var(--hf-editor-selectionBackground, rgba(38, 79, 120, 0.3))',
    },
  }, { dark: isDark });
}

// Dark+ highlight style
const darkHighlightStyle = HighlightStyle.define([
  // JSON / general tokens
  { tag: tags.propertyName, color: '#9cdcfe' },
  { tag: tags.string, color: '#ce9178' },
  { tag: tags.number, color: '#b5cea8' },
  { tag: tags.bool, color: '#569cd6' },
  { tag: tags.null, color: '#569cd6' },
  { tag: tags.punctuation, color: '#d4d4d4' },

  // Keywords
  { tag: tags.keyword, color: '#569cd6' },
  { tag: tags.controlKeyword, color: '#c586c0' },
  { tag: tags.operatorKeyword, color: '#569cd6' },
  { tag: tags.definitionKeyword, color: '#569cd6' },
  { tag: tags.moduleKeyword, color: '#c586c0' },

  // HTML/XML
  { tag: tags.tagName, color: '#569cd6' },
  { tag: tags.attributeName, color: '#9cdcfe' },
  { tag: tags.attributeValue, color: '#ce9178' },
  { tag: tags.angleBracket, color: '#808080' },
  { tag: tags.documentMeta, color: '#569cd6' },

  // Comments
  { tag: tags.comment, color: '#6a9955' },
  { tag: tags.lineComment, color: '#6a9955' },
  { tag: tags.blockComment, color: '#6a9955' },

  // Operators
  { tag: tags.operator, color: '#d4d4d4' },
  { tag: tags.compareOperator, color: '#d4d4d4' },
  { tag: tags.logicOperator, color: '#d4d4d4' },

  // Functions and variables
  { tag: tags.function(tags.variableName), color: '#dcdcaa' },
  { tag: tags.variableName, color: '#9cdcfe' },
  { tag: tags.definition(tags.variableName), color: '#9cdcfe' },
  { tag: tags.typeName, color: '#4ec9b0' },
  { tag: tags.className, color: '#4ec9b0' },
  { tag: tags.namespace, color: '#4ec9b0' },

  // CSS-specific
  { tag: tags.atom, color: '#569cd6' },
  { tag: tags.unit, color: '#b5cea8' },
  { tag: tags.color, color: '#ce9178' },

  // Markdown-specific
  { tag: tags.heading, color: '#569cd6', fontWeight: 'bold' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strong, fontWeight: 'bold' },
  { tag: tags.link, color: '#3794ff', textDecoration: 'underline' },
  { tag: tags.url, color: '#3794ff' },

  // Special
  { tag: tags.regexp, color: '#d16969' },
  { tag: tags.escape, color: '#d7ba7d' },
  { tag: tags.special(tags.string), color: '#d7ba7d' },
  { tag: tags.meta, color: '#569cd6' },
  { tag: tags.processingInstruction, color: '#808080' },
]);

// Light+ highlight style
const lightHighlightStyle = HighlightStyle.define([
  // JSON / general tokens
  { tag: tags.propertyName, color: '#1307ed' },
  { tag: tags.string, color: '#a31515' },
  { tag: tags.number, color: '#098658' },
  { tag: tags.bool, color: '#0000ff' },
  { tag: tags.null, color: '#0000ff' },
  { tag: tags.punctuation, color: '#000000' },

  // Keywords
  { tag: tags.keyword, color: '#0000ff' },
  { tag: tags.controlKeyword, color: '#af00db' },
  { tag: tags.operatorKeyword, color: '#0000ff' },
  { tag: tags.definitionKeyword, color: '#0000ff' },
  { tag: tags.moduleKeyword, color: '#af00db' },

  // HTML/XML
  { tag: tags.tagName, color: '#800000' },
  { tag: tags.attributeName, color: '#e50000' },
  { tag: tags.attributeValue, color: '#0000ff' },
  { tag: tags.angleBracket, color: '#800000' },
  { tag: tags.documentMeta, color: '#800000' },

  // Comments
  { tag: tags.comment, color: '#008000' },
  { tag: tags.lineComment, color: '#008000' },
  { tag: tags.blockComment, color: '#008000' },

  // Operators
  { tag: tags.operator, color: '#000000' },
  { tag: tags.compareOperator, color: '#000000' },
  { tag: tags.logicOperator, color: '#000000' },

  // Functions and variables
  { tag: tags.function(tags.variableName), color: '#795e26' },
  { tag: tags.variableName, color: '#001080' },
  { tag: tags.definition(tags.variableName), color: '#001080' },
  { tag: tags.typeName, color: '#267f99' },
  { tag: tags.className, color: '#267f99' },
  { tag: tags.namespace, color: '#267f99' },

  // CSS-specific
  { tag: tags.atom, color: '#0000ff' },
  { tag: tags.unit, color: '#098658' },
  { tag: tags.color, color: '#a31515' },

  // Markdown-specific
  { tag: tags.heading, color: '#0000ff', fontWeight: 'bold' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strong, fontWeight: 'bold' },
  { tag: tags.link, color: '#0070c1', textDecoration: 'underline' },
  { tag: tags.url, color: '#0070c1' },

  // Special
  { tag: tags.regexp, color: '#811f3f' },
  { tag: tags.escape, color: '#ee0000' },
  { tag: tags.special(tags.string), color: '#ee0000' },
  { tag: tags.meta, color: '#0000ff' },
  { tag: tags.processingInstruction, color: '#808080' },
]);

/**
 * Returns theme + syntax highlighting extensions matching the current VS Code theme.
 */
export function getThemeExtensions(): Extension[] {
  const isDark = isVscodeDark();
  return [
    createVscodeTheme(isDark),
    syntaxHighlighting(isDark ? darkHighlightStyle : lightHighlightStyle),
  ];
}
