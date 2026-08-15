/** Types and text helpers shared by the JSON and YAML spec-edit backends. */

/** One text replacement: replace `length` UTF-16 units at `offset` with `text`. */
export interface SpecTextEdit {
  offset: number;
  length: number;
  text: string;
}

export type SpecDocumentFormat = 'json' | 'yaml';

/** The document a planner operates on: raw text plus its format. */
export interface SpecDocument {
  text: string;
  format: SpecDocumentFormat;
  /** Line ending for inserted lines. Detected from `text` when omitted. */
  eol?: '\n' | '\r\n';
}

export interface SpecEditPlan {
  edits: SpecTextEdit[];
  /** Pointer of the inserted node, computed up front for post-edit reveal. */
  insertedPointer: string;
}

/**
 * Conventional ordering of root-level OpenAPI sections. A newly created root
 * key is inserted after the last existing key that precedes it in this list
 * (e.g. a first `paths:` lands after `tags:`, not at the document end).
 * Unknown keys — extensions and typos — never anchor an insertion.
 */
const ROOT_SECTION_ORDER = [
  'openapi',
  'jsonSchemaDialect',
  'info',
  'externalDocs',
  'servers',
  'security',
  'tags',
  'paths',
  'webhooks',
  'components',
];

export function rootSectionRank(key: string): number {
  return ROOT_SECTION_ORDER.indexOf(key);
}

export function documentEol(doc: SpecDocument): string {
  return doc.eol ?? (doc.text.includes('\r\n') ? '\r\n' : '\n');
}

/** Offset of the first character of the line containing `offset`. */
export function lineStartOffset(text: string, offset: number): number {
  const at = Math.min(Math.max(offset, 0), text.length);
  const newline = text.lastIndexOf('\n', at - 1);
  return newline === -1 ? 0 : newline + 1;
}

/** Offset just past the newline that ends the line containing `offset`. */
export function nextLineStartOffset(text: string, offset: number): number {
  const newline = text.indexOf('\n', Math.min(Math.max(offset, 0), text.length));
  return newline === -1 ? text.length : newline + 1;
}

/**
 * Normalizes a yaml-AST end offset to the start of the following line. Block
 * collection ranges already extend past their trailing newline while scalar
 * ranges stop before it; advancing blindly would eat one extra line.
 */
export function endOfEntryLines(text: string, offset: number): number {
  return offset > 0 && text[offset - 1] === '\n' ? offset : nextLineStartOffset(text, offset);
}

/** End of the line's content (excludes the trailing `\r?\n`). */
export function lineContentEndOffset(text: string, offset: number): number {
  const next = nextLineStartOffset(text, offset);
  if (next === text.length && text[next - 1] !== '\n') return next;
  return text[next - 2] === '\r' ? next - 2 : next - 1;
}

export function indentColumnAt(text: string, offset: number): number {
  const start = lineStartOffset(text, offset);
  let column = 0;
  while (text[start + column] === ' ') column++;
  return column;
}

export function singleEdit(from: number, to: number, newText: string): SpecTextEdit[] {
  return [{ offset: from, length: to - from, text: newText }];
}
