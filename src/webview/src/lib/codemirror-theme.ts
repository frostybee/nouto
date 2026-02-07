import { EditorView } from '@codemirror/view';
import { HighlightStyle } from '@codemirror/language';
import { tags } from '@lezer/highlight';

export const vscodeDarkTheme = EditorView.theme({
  '&': {
    backgroundColor: 'transparent',
    color: 'var(--vscode-editor-foreground, #d4d4d4)',
    fontSize: '12px',
    fontFamily: 'var(--vscode-editor-font-family, Consolas, Monaco, monospace)',
  },
  '.cm-content': {
    caretColor: 'var(--vscode-editorCursor-foreground, #d4d4d4)',
    padding: '4px 0',
  },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    color: 'var(--vscode-editorLineNumber-foreground, #6e7681)',
    border: 'none',
    paddingRight: '8px',
  },
  '.cm-activeLineGutter': {
    color: 'var(--vscode-editorLineNumber-activeForeground, #c6c6c6)',
    backgroundColor: 'transparent',
  },
  '.cm-activeLine': {
    backgroundColor: 'var(--vscode-editor-lineHighlightBackground, rgba(128, 128, 128, 0.08))',
  },
  '.cm-foldPlaceholder': {
    backgroundColor: 'var(--vscode-badge-background, #4d4d4d)',
    color: 'var(--vscode-badge-foreground, #fff)',
    border: 'none',
    padding: '0 6px',
    borderRadius: '4px',
    fontSize: '10px',
    fontStyle: 'italic',
    margin: '0 4px',
  },
  '.cm-foldGutter .cm-gutterElement': {
    cursor: 'pointer',
    color: 'var(--vscode-editorLineNumber-foreground, #6e7681)',
    fontSize: '12px',
    lineHeight: '1.5',
    textAlign: 'center',
    width: '16px',
  },
  '.cm-foldGutter .cm-gutterElement:hover': {
    color: 'var(--vscode-editorLineNumber-activeForeground, #c6c6c6)',
  },
  '&.cm-focused': {
    outline: 'none',
  },
  '.cm-selectionBackground, ::selection': {
    backgroundColor: 'var(--vscode-editor-selectionBackground, #264f78) !important',
  },
  '.cm-matchingBracket': {
    backgroundColor: 'var(--vscode-editorBracketMatch-background, rgba(0, 100, 0, 0.3))',
    outline: '1px solid var(--vscode-editorBracketMatch-border, #888)',
  },
  '.cm-searchMatch': {
    backgroundColor: 'var(--vscode-editor-findMatchHighlightBackground, rgba(234, 92, 0, 0.33))',
  },
  '.cm-searchMatch.cm-searchMatch-selected': {
    backgroundColor: 'var(--vscode-editor-findMatchBackground, rgba(81, 92, 106, 0.6))',
  },
  '.cm-panels': {
    backgroundColor: 'var(--vscode-editorWidget-background, #252526)',
    color: 'var(--vscode-editorWidget-foreground, #d4d4d4)',
  },
  '.cm-panels input, .cm-panels button': {
    fontFamily: 'var(--vscode-font-family, sans-serif)',
    fontSize: '12px',
  },
  '.cm-panels input[type="text"], .cm-panels input[type="search"]': {
    backgroundColor: 'var(--vscode-input-background, #3c3c3c)',
    color: 'var(--vscode-input-foreground, #d4d4d4)',
    border: '1px solid var(--vscode-input-border, #3c3c3c)',
    borderRadius: '2px',
    padding: '2px 4px',
  },
  '.cm-panels button': {
    backgroundColor: 'var(--vscode-button-secondaryBackground, #3a3d41)',
    color: 'var(--vscode-button-secondaryForeground, #d4d4d4)',
    border: 'none',
    borderRadius: '2px',
    padding: '2px 8px',
    cursor: 'pointer',
  },
  '.cm-panels button:hover': {
    backgroundColor: 'var(--vscode-button-secondaryHoverBackground, #45494e)',
  },
  '.cm-scroller': {
    overflow: 'auto',
  },
  '.cm-minimap': {
    width: '60px',
    opacity: '0.6',
  },
  '.cm-minimap .cm-minimap-overlay': {
    backgroundColor: 'var(--vscode-editor-selectionBackground, rgba(38, 79, 120, 0.3))',
  },
});

export const vscodeHighlightStyle = HighlightStyle.define([
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
  { tag: tags.link, color: 'var(--vscode-textLink-foreground, #3794ff)', textDecoration: 'underline' },
  { tag: tags.url, color: 'var(--vscode-textLink-foreground, #3794ff)' },

  // Special
  { tag: tags.regexp, color: '#d16969' },
  { tag: tags.escape, color: '#d7ba7d' },
  { tag: tags.special(tags.string), color: '#d7ba7d' },
  { tag: tags.meta, color: '#569cd6' },
  { tag: tags.processingInstruction, color: '#808080' },
]);
