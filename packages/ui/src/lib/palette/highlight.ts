/**
 * Highlight matching characters in text for search results
 *
 * This utility highlights matched characters with <mark> tags
 * for visual feedback in command palette results.
 */

export interface HighlightMatch {
  text: string;
  highlighted: boolean;
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Highlight matched characters in text
 *
 * @param text - The text to highlight
 * @param query - The search query
 * @param caseSensitive - Whether matching should be case-sensitive
 * @returns HTML string with <mark> tags around matches
 */
export function highlightMatches(
  text: string,
  query: string,
  caseSensitive = false
): string {
  if (!text || !query) {
    return escapeHtml(text);
  }

  // Escape query for use in regex
  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Build regex with word boundaries and fuzzy matching
  const flags = caseSensitive ? 'g' : 'gi';
  const regex = new RegExp(escapedQuery, flags);

  // Find matches
  const matches = [...text.matchAll(regex)];

  if (matches.length === 0) {
    return escapeHtml(text);
  }

  // Build highlighted HTML
  let result = '';
  let lastIndex = 0;

  for (const match of matches) {
    const matchStart = match.index!;
    const matchEnd = matchStart + match[0].length;

    // Add text before match
    result += escapeHtml(text.slice(lastIndex, matchStart));

    // Add highlighted match
    result += `<mark>${escapeHtml(match[0])}</mark>`;

    lastIndex = matchEnd;
  }

  // Add remaining text
  result += escapeHtml(text.slice(lastIndex));

  return result;
}

/**
 * Highlight multiple terms in text
 *
 * @param text - The text to highlight
 * @param terms - Array of search terms to highlight
 * @param caseSensitive - Whether matching should be case-sensitive
 * @returns HTML string with <mark> tags around all matches
 */
export function highlightMultipleTerms(
  text: string,
  terms: string[],
  caseSensitive = false
): string {
  if (!text || !terms || terms.length === 0) {
    return escapeHtml(text);
  }

  // Combine all terms into a single regex pattern
  const escapedTerms = terms.map(term =>
    term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  );
  const pattern = escapedTerms.join('|');
  const flags = caseSensitive ? 'g' : 'gi';
  const regex = new RegExp(pattern, flags);

  // Find all matches
  const matches = [...text.matchAll(regex)];

  if (matches.length === 0) {
    return escapeHtml(text);
  }

  // Build highlighted HTML
  let result = '';
  let lastIndex = 0;

  for (const match of matches) {
    const matchStart = match.index!;
    const matchEnd = matchStart + match[0].length;

    // Add text before match
    result += escapeHtml(text.slice(lastIndex, matchStart));

    // Add highlighted match
    result += `<mark>${escapeHtml(match[0])}</mark>`;

    lastIndex = matchEnd;
  }

  // Add remaining text
  result += escapeHtml(text.slice(lastIndex));

  return result;
}

/**
 * Get matches as structured data (for custom rendering)
 *
 * @param text - The text to analyze
 * @param query - The search query
 * @param caseSensitive - Whether matching should be case-sensitive
 * @returns Array of text segments with highlight flags
 */
export function getMatchSegments(
  text: string,
  query: string,
  caseSensitive = false
): HighlightMatch[] {
  if (!text || !query) {
    return [{ text, highlighted: false }];
  }

  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const flags = caseSensitive ? 'g' : 'gi';
  const regex = new RegExp(escapedQuery, flags);

  const matches = [...text.matchAll(regex)];

  if (matches.length === 0) {
    return [{ text, highlighted: false }];
  }

  const segments: HighlightMatch[] = [];
  let lastIndex = 0;

  for (const match of matches) {
    const matchStart = match.index!;
    const matchEnd = matchStart + match[0].length;

    // Add non-highlighted segment before match
    if (matchStart > lastIndex) {
      segments.push({
        text: text.slice(lastIndex, matchStart),
        highlighted: false,
      });
    }

    // Add highlighted segment
    segments.push({
      text: match[0],
      highlighted: true,
    });

    lastIndex = matchEnd;
  }

  // Add remaining non-highlighted segment
  if (lastIndex < text.length) {
    segments.push({
      text: text.slice(lastIndex),
      highlighted: false,
    });
  }

  return segments;
}

/**
 * Truncate text with ellipsis, preserving highlighted matches
 *
 * @param text - The text to truncate
 * @param query - The search query
 * @param maxLength - Maximum length before truncation
 * @param caseSensitive - Whether matching should be case-sensitive
 * @returns Truncated HTML string with highlights
 */
export function truncateWithHighlights(
  text: string,
  query: string,
  maxLength: number,
  caseSensitive = false
): string {
  if (text.length <= maxLength) {
    return highlightMatches(text, query, caseSensitive);
  }

  // Find first match position
  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const flags = caseSensitive ? 'i' : '';
  const regex = new RegExp(escapedQuery, flags);
  const match = text.match(regex);

  if (!match || match.index === undefined) {
    // No match found, truncate from start
    const truncated = text.slice(0, maxLength - 3) + '...';
    return escapeHtml(truncated);
  }

  const matchStart = match.index;
  const matchEnd = matchStart + match[0].length;

  // Calculate context window around match
  const contextBefore = Math.floor((maxLength - match[0].length) / 2);
  const contextAfter = Math.ceil((maxLength - match[0].length) / 2);

  let start = Math.max(0, matchStart - contextBefore);
  let end = Math.min(text.length, matchEnd + contextAfter);

  // Adjust if window is too small
  if (end - start < maxLength) {
    if (start === 0) {
      end = Math.min(text.length, maxLength);
    } else if (end === text.length) {
      start = Math.max(0, text.length - maxLength);
    }
  }

  // Build truncated text with ellipsis
  let truncated = '';
  if (start > 0) truncated += '...';
  truncated += text.slice(start, end);
  if (end < text.length) truncated += '...';

  // Highlight matches in truncated text
  return highlightMatches(truncated, query, caseSensitive);
}
