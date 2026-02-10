import { foldService } from '@codemirror/language';

/**
 * Custom fold service that ensures root-level JSON arrays/objects are always
 * foldable, even before the parser has finished processing the full document.
 *
 * CodeMirror's built-in syntaxFolding skips nodes marked as "unfinished"
 * (parser hasn't seen the closing bracket yet). For root-level containers
 * that span the entire document, this means they're not foldable until
 * the parser completes — which causes foldAll and the fold gutter to miss them.
 *
 * This service uses text-based detection for line 1 to avoid the dependency
 * on parser completion.
 */
export function rootFoldService() {
  return foldService.of((state, lineStart, lineEnd) => {
    // Only handle the first line
    if (lineStart !== 0) return null;

    const firstChar = state.doc.sliceString(0, 1);
    if (firstChar !== '[' && firstChar !== '{') return null;

    const closingChar = firstChar === '[' ? ']' : '}';

    // Scan backwards from the end to find the matching closing bracket
    const lastLine = state.doc.line(state.doc.lines);
    const lastLineText = state.doc.sliceString(lastLine.from, lastLine.to);
    const closeIdx = lastLineText.lastIndexOf(closingChar);

    if (closeIdx < 0) return null;

    const closingPos = lastLine.from + closeIdx;

    // The fold range goes from after '[' to before ']'
    // Only fold if there's content between the brackets (multi-line)
    if (closingPos <= 1) return null;

    return { from: 1, to: closingPos };
  });
}
