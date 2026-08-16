import { firstSyntaxError } from '../syntax';
import type { OpenApiAnalysis, OpenApiFormat } from '../types';

/**
 * One-line status text for the outline when the document has no
 * `parsedSpec`. Shared by both hosts so the wording matches.
 *
 * - `stale: false` (nothing to show): "Can't build the outline: line 12: ..."
 * - `stale: true` (a previous tree is still on screen): "Outline is out of
 *   date: line 12: ..."
 *
 * The detail is the first syntax error when there is one; otherwise the first
 * error-level analysis diagnostic (e.g. "Document root must be an object.");
 * otherwise a generic "could not be parsed".
 */
export function describeOutlineParseFailure(
  content: string,
  format: OpenApiFormat,
  analysis: Pick<OpenApiAnalysis, 'diagnostics'> | undefined,
  options: { stale: boolean }
): string {
  const prefix = options.stale ? 'Outline is out of date' : "Can't build the outline";
  const syntax = firstSyntaxError(content, format);
  if (syntax) return `${prefix}: line ${syntax.line}: ${syntax.message}`;
  const semantic = analysis?.diagnostics.find((diagnostic) => diagnostic.severity === 'error');
  if (semantic) return `${prefix}: ${semantic.message}`;
  return `${prefix}: the document could not be parsed.`;
}
