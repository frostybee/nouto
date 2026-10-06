/**
 * Records a page as PNG frames over the Chrome DevTools screencast and turns
 * them into a GIF with ffmpeg, plus helpers that move and type like a person.
 * PNG frames keep text sharp; Playwright's recordVideo (webm) blurs it.
 */
import { execFileSync } from 'child_process';
import { mkdirSync, rmSync, statSync, writeFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import type { CDPSession, Frame, Locator, Page } from '@playwright/test';

export const OUTPUT_DIR = fileURLToPath(new URL('./output', import.meta.url));

interface Frame {
  data: string;
  /** Seconds, from the screencast frame metadata. */
  timestamp: number;
}

export interface Recording {
  stop(name: string, options?: { holdMs?: number; fps?: number }): Promise<string>;
}

export async function startRecording(page: Page): Promise<Recording> {
  const cdp: CDPSession = await page.context().newCDPSession(page);
  const frames: Frame[] = [];
  cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
    frames.push({ data, timestamp: metadata.timestamp ?? Date.now() / 1000 });
    await cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });
  // Ask for full device-pixel frames, so 2x windows record at 2x
  const viewport = page.viewportSize() ?? { width: 1280, height: 720 };
  const dpr = await page.evaluate(() => window.devicePixelRatio);
  await cdp.send('Page.startScreencast', {
    format: 'png',
    everyNthFrame: 1,
    maxWidth: Math.round(viewport.width * dpr),
    maxHeight: Math.round(viewport.height * dpr),
  });

  return {
    async stop(name, { holdMs = 1500, fps = 15 } = {}) {
      await cdp.send('Page.stopScreencast');
      await cdp.detach();
      if (frames.length === 0) throw new Error('No frames were captured.');
      return encodeGif(name, frames, holdMs, fps);
    },
  };
}

function encodeGif(name: string, frames: Frame[], holdMs: number, fps: number): string {
  const frameDir = join(OUTPUT_DIR, '.frames', name);
  rmSync(frameDir, { recursive: true, force: true });
  mkdirSync(frameDir, { recursive: true });

  // The concat demuxer shows each frame for its `duration`; frames only arrive
  // when the page repaints, so idle stretches become long durations.
  const lines: string[] = [];
  frames.forEach((frame, i) => {
    const file = `f${String(i).padStart(5, '0')}.png`;
    writeFileSync(join(frameDir, file), Buffer.from(frame.data, 'base64'));
    const next = frames[i + 1];
    const seconds = next ? Math.max(next.timestamp - frame.timestamp, 0.001) : holdMs / 1000;
    lines.push(`file '${file}'`, `duration ${seconds.toFixed(3)}`);
  });
  // The concat demuxer ignores the last entry's duration unless the file repeats
  lines.push(`file 'f${String(frames.length - 1).padStart(5, '0')}.png'`);
  writeFileSync(join(frameDir, 'list.txt'), lines.join('\n'));

  const output = join(OUTPUT_DIR, `${name}.gif`);
  const filter = `fps=${fps},split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`;
  execFileSync(
    process.env.FFMPEG_PATH ?? 'ffmpeg',
    ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', 'list.txt', '-vf', filter, '-loop', '0', output],
    { cwd: frameDir, stdio: 'inherit' }
  );

  const sizeMb = statSync(output).size / (1024 * 1024);
  console.log(`[media] ${output}: ${frames.length} frames, ${sizeMb.toFixed(2)} MB`);
  if (sizeMb > 4) console.warn(`[media] ${name}.gif is over 4 MB; trim the script or lower the fps.`);
  return output;
}

export function pause(page: Page, ms: number): Promise<void> {
  return page.waitForTimeout(ms);
}

/** Last pointer position per page; Playwright doesn't expose it. */
const positions = new WeakMap<Page, { x: number; y: number }>();

async function drawCursor(page: Page, x: number, y: number): Promise<void> {
  await page.evaluate(([cx, cy]) => (window as any).__mediaCursor?.(cx, cy), [x, y]);
}

/** Puts the pointer somewhere without animating, for the opening frame. */
export async function placeCursor(page: Page, x: number, y: number): Promise<void> {
  await page.mouse.move(x, y);
  await drawCursor(page, x, y);
  positions.set(page, { x, y });
}

/** Moves the pointer to a point with ease-in-out, drawing the cursor on the way. */
async function glide(page: Page, to: { x: number; y: number }, steps: number): Promise<void> {
  const from = positions.get(page) ?? to;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
    const x = from.x + (to.x - from.x) * eased;
    const y = from.y + (to.y - from.y) * eased;
    await page.mouse.move(x, y);
    await drawCursor(page, x, y);
  }
  positions.set(page, to);
}

/** A point inside an element: horizontally centered, `yFraction` of the way down. */
async function pointIn(target: Locator, yFraction = 0.5): Promise<{ x: number; y: number }> {
  const box = await target.boundingBox();
  if (!box) throw new Error(`Element is not visible: ${target}`);
  return { x: box.x + box.width / 2, y: box.y + box.height * yFraction };
}

/** Glides the pointer to the center of an element, like a person moving the mouse. */
export async function moveTo(page: Page, target: Locator, steps = 25): Promise<void> {
  await glide(page, await pointIn(target), steps);
}

/**
 * Drags `source` onto `target`. `yFraction` picks the drop point inside the
 * target: Nouto treats the middle of a folder as "inside" and the top or
 * bottom quarter as "before" or "after".
 */
export async function dragTo(
  page: Page,
  source: Locator,
  target: Locator,
  { yFraction = 0.5, steps = 30 }: { yFraction?: number; steps?: number } = {}
): Promise<void> {
  await dragToPoint(page, source, await pointIn(target, yFraction), steps);
}

/** Drags `source` to a point in page coordinates, for splitters and resizing. */
export async function dragToPoint(
  page: Page,
  source: Locator,
  to: { x: number; y: number },
  steps = 30
): Promise<void> {
  await moveTo(page, source);
  await pause(page, 150);
  await page.mouse.down();
  // A short first move starts the drag before the glide
  const start = positions.get(page)!;
  await glide(page, { x: start.x + 4, y: start.y + 6 }, 3);
  await glide(page, to, steps);
  await pause(page, 250);
  await page.mouse.up();
}

export async function click(
  page: Page,
  target: Locator,
  steps = 25,
  button: 'left' | 'right' = 'left'
): Promise<void> {
  await moveTo(page, target, steps);
  await pause(page, 120);
  const { x, y } = positions.get(page)!;
  await page.evaluate(([cx, cy]) => (window as any).__mediaClick?.(cx, cy), [x, y]);
  await page.mouse.down({ button });
  await page.mouse.up({ button });
}

export function rightClick(page: Page, target: Locator, steps = 25): Promise<void> {
  return click(page, target, steps, 'right');
}

/**
 * Picks an option in a native <select>. Chromium draws the open list as an OS
 * popup that screencasts don't capture, so show the click and set the value.
 */
export async function choose(page: Page, select: Locator, value: string, steps = 18): Promise<void> {
  await moveTo(page, select, steps);
  await pause(page, 120);
  const { x, y } = positions.get(page)!;
  await page.evaluate(([cx, cy]) => (window as any).__mediaClick?.(cx, cy), [x, y]);
  await select.selectOption(value);
}

/** Fold marker in the CodeMirror gutter beside the first line that starts with `text`. */
export async function foldMarkerFor(scope: Page | Frame, text: string): Promise<Locator> {
  const line = scope.locator('.cm-content .cm-line', { hasText: text }).first();
  const lineBox = await line.boundingBox();
  if (!lineBox) throw new Error(`Line not visible: ${text}`);
  const markers = scope.locator('.cm-foldGutter .cm-gutterElement');
  for (let i = 0; i < (await markers.count()); i++) {
    const box = await markers.nth(i).boundingBox();
    if (box && Math.abs(box.y - lineBox.y) < 3) return markers.nth(i).locator('.fold-gutter-icon');
  }
  throw new Error(`No fold marker beside: ${text}`);
}

export async function typeText(page: Page, text: string, delayMs = 70): Promise<void> {
  await page.keyboard.type(text, { delay: delayMs });
}

/** Inserts text in one step, like a paste: one input event, no per-key events. */
export async function pasteText(page: Page, text: string): Promise<void> {
  await page.keyboard.insertText(text);
}
