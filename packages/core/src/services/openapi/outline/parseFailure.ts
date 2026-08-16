import { firstSyntaxError } from '../syntax';
import type { OpenApiAnalysis, OpenApiFormat } from '../types';
import type { OutlineNode } from './model';

/** Why the outline can't reflect the document right now, in host-neutral pieces. */
export interface OutlineParseFailure {
  /** "Can't build the outline" or, when a previous tree is still shown, "Outline is out of date". */
  title: string;
  /** "line 12: Implicit keys need to be on a single line", or a semantic message, or a generic fallback. */
  detail: string;
  /** `${title}: ${detail}` for single-line surfaces. */
  message: string;
  /** 1-based line of the first syntax error, when there is one. */
  line?: number;
  /** UTF-16 offset of the first syntax error, for click-to-jump. */
  offset?: number;
}

/**
 * Describes a document without a `parsedSpec`. Shared by both hosts so the
 * wording matches. The detail is the first syntax error when there is one;
 * otherwise the first error-level analysis diagnostic (e.g. "Document root
 * must be an object."); otherwise a generic "could not be parsed".
 */
export function outlineParseFailure(
  content: string,
  format: OpenApiFormat,
  analysis: Pick<OpenApiAnalysis, 'diagnostics'> | undefined,
  options: { stale: boolean }
): OutlineParseFailure {
  const title = options.stale ? 'Outline is out of date' : "Can't build the outline";
  const syntax = firstSyntaxError(content, format);
  if (syntax) {
    const detail = `line ${syntax.line}: ${syntax.message}`;
    return { title, detail, message: `${title}: ${detail}`, line: syntax.line, offset: syntax.from };
  }
  const semantic = analysis?.diagnostics.find((diagnostic) => diagnostic.severity === 'error');
  const detail = semantic ? semantic.message : 'the document could not be parsed.';
  return { title, detail, message: `${title}: ${detail}` };
}

/** One-line form of {@link outlineParseFailure}. */
export function describeOutlineParseFailure(
  content: string,
  format: OpenApiFormat,
  analysis: Pick<OpenApiAnalysis, 'diagnostics'> | undefined,
  options: { stale: boolean }
): string {
  return outlineParseFailure(content, format, analysis, options).message;
}

/** Stable id of the synthetic error row, so hosts can recognize and replace it. */
export const PARSE_FAILURE_NODE_ID = 'parse-failure';

/**
 * A synthetic root row that shows the parse failure as an error inside the
 * tree (red `error` icon, title as label, detail as description). Tree views
 * can't style free text, so this is how the failure reads as an error. It
 * carries no pointer; hosts jump to `offset` when the row is clicked.
 */
export function parseFailureNode(documentUri: string, failure: OutlineParseFailure): OutlineNode {
  return {
    id: PARSE_FAILURE_NODE_ID,
    label: failure.title,
    description: failure.detail,
    tooltip: failure.message,
    iconId: 'error',
    iconColor: 'errorForeground',
    contextValue: 'outlineParseFailure',
    documentUri,
    offset: failure.offset,
    children: [],
  };
}
