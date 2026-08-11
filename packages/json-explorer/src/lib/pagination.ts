/**
 * Array pagination helpers for the JSON Explorer tree.
 * Arrays render only the first N items until "Show more" is clicked;
 * navigation to an off-page index must raise that limit first.
 */

import { pathToSegments } from './path-utils';

/**
 * Compute the page-size bumps required so every array index along `path`
 * falls within its array's visible page.
 *
 * Returns a new map with the raised limits, or null when no bump is needed.
 * Limits are only ever increased, so manual "Show more" expansions are preserved.
 */
export function computeBumpedPageMap(
  path: string,
  currentMap: ReadonlyMap<string, number>,
  pageSize: number,
): Map<string, number> | null {
  const segments = pathToSegments(path);
  let needsPageUpdate = false;
  const nextPageMap = new Map(currentMap);
  for (const seg of segments) {
    const bracketMatch = seg.path.match(/^(.*)\[(\d+)\]$/);
    if (bracketMatch) {
      const arrayPath = bracketMatch[1] || '$';
      const index = parseInt(bracketMatch[2], 10);
      const currentLimit = nextPageMap.get(arrayPath) ?? pageSize;
      if (index >= currentLimit) {
        const newLimit = Math.ceil((index + 1) / pageSize) * pageSize;
        nextPageMap.set(arrayPath, newLimit);
        needsPageUpdate = true;
      }
    }
  }
  return needsPageUpdate ? nextPageMap : null;
}
