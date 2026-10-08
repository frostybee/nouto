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
 * below that element, for regions that stretch past their content. `within`
 * keeps the padding inside an element, such as a webview's `body`, so the
 * crop doesn't pick up VS Code's tab strip around it.
 */
export async function captureShot(
  page: Page,
  regions: Page | Locator | Locator[],
  file: string,
  { padding = 8, until, within }: { padding?: number; until?: Locator; within?: Locator } = {}
): Promise<string> {
  const path = await prepareShot(page, file);

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
  let bounds = { x: 0, y: 0, width: viewport.width, height: viewport.height };
  if (within) {
    const box = await within.boundingBox();
    if (!box) throw new Error(`Element is not visible: ${within}`);
    bounds = box;
  }
  const left = Math.max(bounds.x, Math.min(...boxes.map((b) => b.x)) - padding);
  const top = Math.max(bounds.y, Math.min(...boxes.map((b) => b.y)) - padding);
  const right = Math.min(bounds.x + bounds.width, Math.max(...boxes.map((b) => b.x + b.width)) + padding);
  let bottom = Math.min(bounds.y + bounds.height, Math.max(...boxes.map((b) => b.y + b.height)) + padding);
  if (until) {
    const end = await until.boundingBox();
    if (!end) throw new Error(`Element is not visible: ${until}`);
    bottom = Math.min(bottom, end.y + end.height + Math.max(padding, 16));
  }
  await page.screenshot({ path, clip: { x: left, y: top, width: right - left, height: bottom - top } });
  return path;
}

/**
 * Saves the window below `below` (for example VS Code's title bar) at full
 * width. The landing page frames draw their own title bar.
 */
export async function captureWindow(page: Page, file: string, { below }: { below: Locator }): Promise<string> {
  const path = await prepareShot(page, file);
  const box = await below.boundingBox();
  if (!box) throw new Error(`Element is not visible: ${below}`);
  const viewport = page.viewportSize()!;
  const top = box.y + box.height;
  await page.screenshot({ path, clip: { x: 0, y: top, width: viewport.width, height: viewport.height - top } });
  return path;
}

async function prepareShot(page: Page, file: string): Promise<string> {
  // The recorder's drawn cursor belongs in GIFs, not in stills
  await page.addStyleTag({ content: '#media-cursor, .media-click-ring { display: none !important; }' });
  const path = join(DOCS_SHOTS_DIR, file);
  mkdirSync(dirname(path), { recursive: true });
  return path;
}
