/**
 * Still screenshots for the documentation site. Shots are cropped to the part
 * of the UI a page describes and written at the window's 2x density, so
 * Astro can serve them sharp in the docs column.
 */
import { mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import type { Locator, Page } from '@playwright/test';

/** `packages/website/src/assets/screenshots/`; pages link here with relative paths. */
export const DOCS_SHOTS_DIR = fileURLToPath(new URL('../../../website/src/assets/screenshots/', import.meta.url));

/**
 * Saves the union of `regions` (plus `padding` CSS px, clamped to the window)
 * to `file`, relative to DOCS_SHOTS_DIR, for example `response/timing-breakdown.png`.
 * Pass the page itself to capture the whole window. `until` ends the crop
 * below that element, for regions that stretch past their content.
 */
export async function captureShot(
  page: Page,
  regions: Page | Locator | Locator[],
  file: string,
  { padding = 8, until }: { padding?: number; until?: Locator } = {}
): Promise<string> {
  // The recorder's drawn cursor belongs in GIFs, not in stills
  await page.addStyleTag({ content: '#media-cursor, .media-click-ring { display: none !important; }' });
  const path = join(DOCS_SHOTS_DIR, file);
  mkdirSync(dirname(path), { recursive: true });

  if (regions === page) {
    await page.screenshot({ path });
    return path;
  }

  const boxes = [];
  for (const region of Array.isArray(regions) ? regions : [regions as Locator]) {
    const box = await region.boundingBox();
    if (!box) throw new Error(`Region is not visible: ${region}`);
    boxes.push(box);
  }
  const viewport = page.viewportSize()!;
  const left = Math.max(0, Math.min(...boxes.map((b) => b.x)) - padding);
  const top = Math.max(0, Math.min(...boxes.map((b) => b.y)) - padding);
  const right = Math.min(viewport.width, Math.max(...boxes.map((b) => b.x + b.width)) + padding);
  let bottom = Math.min(viewport.height, Math.max(...boxes.map((b) => b.y + b.height)) + padding);
  if (until) {
    const end = await until.boundingBox();
    if (!end) throw new Error(`Element is not visible: ${until}`);
    bottom = Math.min(bottom, end.y + end.height + Math.max(padding, 16));
  }
  await page.screenshot({ path, clip: { x: left, y: top, width: right - left, height: bottom - top } });
  return path;
}
