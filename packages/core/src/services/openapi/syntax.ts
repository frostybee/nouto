import { parseTree, printParseErrorCode } from 'jsonc-parser';
import type { ParseError } from 'jsonc-parser';
import { parseDocument } from 'yaml';
import type { OpenApiDiagnostic, OpenApiFormat } from './types';

/**
 * Pure, host-agnostic syntax diagnostics for an OpenAPI source document.
 *
 * Syntax errors describe text that failed to parse, so unlike every other
 * diagnostic source there is no JSON Pointer to attach — `pointer` stays
 * undefined and the raw UTF-16 offset range travels in `data: { from, to }`
 * for hosts to convert into their own range type directly.
 */
export function buildSyntaxDiagnostics(
  content: string,
  format: OpenApiFormat
): OpenApiDiagnostic[] {
  if (!content.trim()) return [];
  return format === 'json'
    ? buildJsonSyntaxDiagnostics(content)
    : buildYamlSyntaxDiagnostics(content);
}

/** The first parse error of a document, with a 1-based line for messages. */
export interface SyntaxErrorSummary {
  message: string;
  /** UTF-16 offset where the error starts. */
  from: number;
  /** 1-based line of `from`. */
  line: number;
}

/**
 * The first syntax error in `content`, or undefined when it parses. Hosts use
 * it for one-line status text ("line 12: ...") where a full diagnostic list
 * would be noise, e.g. the outline view when the document can't be built.
 */
export function firstSyntaxError(content: string, format: OpenApiFormat): SyntaxErrorSummary | undefined {
  const [first] = buildSyntaxDiagnostics(content, format);
  if (!first) return undefined;
  const from = typeof first.data?.from === 'number' ? first.data.from : 0;
  const line = content.slice(0, from).split('\n').length;
  return { message: first.message, from, line };
}

function syntaxDiagnostic(message: string, from: number, to: number, length: number): OpenApiDiagnostic {
  const clampedFrom = Math.min(Math.max(from, 0), length);
  const clampedTo = Math.min(Math.max(to, clampedFrom + 1), length);
  return {
    source: 'syntax',
    severity: 'error',
    message,
    code: 'syntax',
    data: { from: clampedFrom, to: Math.max(clampedTo, clampedFrom) },
  };
}

function buildYamlSyntaxDiagnostics(content: string): OpenApiDiagnostic[] {
  const parsed = parseDocument(content, {
    strict: false,
    // Bare messages: the "at line X, column Y" + snippet suffix would repeat
    // the position the host already renders (squiggle, outline status).
    prettyErrors: false,
  });
  return parsed.errors.map((error) => {
    const [from, to] = error.pos;
    return syntaxDiagnostic(error.message, from, to, content.length);
  });
}

/** 'UnexpectedEndOfString' → 'Unexpected end of string'. */
function humanizeParseErrorCode(code: string): string {
  const spaced = code.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function buildJsonSyntaxDiagnostics(content: string): OpenApiDiagnostic[] {
  const errors: ParseError[] = [];
  parseTree(content, errors, {
    allowTrailingComma: true,
    disallowComments: false,
    allowEmptyContent: true,
  });
  return errors.map((error) =>
    syntaxDiagnostic(
      humanizeParseErrorCode(printParseErrorCode(error.error)),
      error.offset,
      error.offset + Math.max(error.length, 1),
      content.length
    )
  );
}
