/**
 * Drives real VS Code served by `code serve-web` (see README.md). Nouto runs
 * in the server's Node.js extension host; its panels are webviews nested two
 * frames deep in the workbench page. Workbench selectors live only here, so a
 * VS Code update means one file to fix.
 */
import { chromium, type BrowserContext, type Frame, type Page } from '@playwright/test';
import { installFakeCursor } from './cursor';
import { OUTPUT_DIR } from './recorder';
import { seedNoutoState, type SeedOptions } from './state';

export const VSCODE_URL = process.env.NOUTO_MEDIA_VSCODE_URL ?? 'http://127.0.0.1:8000/';
export const PROFILE_DIR = process.env.NOUTO_MEDIA_BROWSER_DIR ?? 'D:\\tmp\\nouto-media\\browser';

const NOUTO_TAB = '.activitybar li[role="tab"][aria-label="Nouto"]';
/** The Restricted Mode banner's Manage link; present only while the folder is untrusted. */
const MANAGE_TRUST = 'a[href="command:workbench.trust.manage"]';
const SIDEBAR_READY = '.new-request-button';
const REQUEST_READY = '.url-input';

export interface WindowSize {
  width: number;
  height: number;
  /** 2 renders at double density (2560x1440 for a 1280x720 window), sharp on high-DPI screens. */
  deviceScaleFactor?: number;
}

export async function launchVsCode(
  size: WindowSize = { width: 1440, height: 810 }
): Promise<{ context: BrowserContext; page: Page }> {
  const dpr = size.deviceScaleFactor ?? 1;
  // A persistent profile keeps workspace trust, theme, and dismissed tips between runs
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    viewport: { width: size.width, height: size.height },
    deviceScaleFactor: dpr,
    colorScheme: 'dark',
    // Emulated density alone still yields 1x screencast frames; this renders at dpr for real
    args: dpr > 1 ? [`--force-device-scale-factor=${dpr}`] : [],
  });
  await context.addInitScript(installFakeCursor);
  const page = context.pages()[0] ?? (await context.newPage());
  // Fail a stuck step quickly instead of at the test timeout
  page.setDefaultTimeout(20000);
  await openWorkbench(page);
  return { context, page };
}

async function openWorkbench(page: Page): Promise<void> {
  await page.goto(VSCODE_URL);
  await page.locator('.monaco-workbench').waitFor({ timeout: 60000 });
  await page.locator(NOUTO_TAB).or(page.locator(MANAGE_TRUST)).first().waitFor({ timeout: 60000 });
}

/** Runs a command by its Command Palette title. */
export async function runCommand(page: Page, title: string): Promise<void> {
  await page.keyboard.press('F1');
  const input = page.locator('.quick-input-widget input');
  await input.waitFor();
  await input.fill(`>${title}`);
  await page.waitForTimeout(400);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
}

/** Finds the frame whose document contains `selector`, waiting for it to load. */
export async function frameWith(page: Page, selector: string, timeoutMs = 45000): Promise<Frame> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const frame of page.frames()) {
      if (await frame.locator(selector).count().catch(() => 0)) return frame;
    }
    await page.waitForTimeout(250);
  }
  throw new Error(`No frame contains ${selector}`);
}

/** A section header in the side bar, such as "API Testing" or "OpenAPI Outline". */
export function sidebarSection(page: Page, title: string) {
  return page.locator(`.part.sidebar .pane-header[aria-label^="${title}"]`);
}

/** Expands or collapses a side bar section. The workbench remembers the state between runs. */
export async function setSectionExpanded(page: Page, title: string, expanded: boolean): Promise<void> {
  const header = sidebarSection(page, title);
  const current = (await header.getAttribute('aria-expanded').catch(() => null)) === 'true';
  if (current !== expanded) await header.click();
}

/** Opens the Nouto view container and gives the API Testing view the full height. */
export async function openNouto(page: Page): Promise<Frame> {
  const tab = page.locator(NOUTO_TAB);
  if ((await tab.getAttribute('aria-selected')) !== 'true') await tab.click();
  await setSectionExpanded(page, 'API Testing', true);
  await setSectionExpanded(page, 'OpenAPI Outline', false);
  return frameWith(page, SIDEBAR_READY);
}

/** The "where to save" quick pick item that **New Request** shows first. */
export function quickRequestItem(page: Page) {
  return page.locator('.quick-input-widget .monaco-list-row', { hasText: 'No Collection (Quick Request)' });
}

/** Opens an unsaved request tab from the sidebar and returns its frame. */
export async function openEmptyRequest(page: Page, sidebar: Frame): Promise<Frame> {
  await sidebar.locator(SIDEBAR_READY).click();
  await quickRequestItem(page).click();
  const panel = await frameWith(page, REQUEST_READY);
  await panel.locator(REQUEST_READY).waitFor();
  return panel;
}

/**
 * Stacks the response below the request and gives it `responseShare` of the
 * height, so narrow windows don't squeeze the response side by side.
 */
export async function stackPanels(page: Page, panel: Frame, responseShare = 0.7): Promise<void> {
  const panels = panel.locator('.panels');
  if (await panels.evaluate((el) => el.classList.contains('horizontal'))) {
    await panel.locator('.layout-toggle-btn').click();
  }
  // Measure the splitter only after the stacked layout has rendered
  await panel.locator('.panels:not(.horizontal) .splitter.vertical').first().waitFor();
  await page.waitForTimeout(300);
  const splitter = panel.locator('.panels .splitter').first();
  const box = await splitter.boundingBox();
  const area = await panels.boundingBox();
  if (!box || !area) return;
  const targetY = area.y + area.height * (1 - responseShare);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, targetY, { steps: 8 });
  await page.mouse.up();
}

/** Empties Nouto's Drafts, which collects every unsaved request a recording sends. */
async function clearDrafts(page: Page, sidebar: Frame): Promise<void> {
  const header = sidebar.locator('.collection-header', { hasText: 'Drafts' }).first();
  const count = Number((await header.locator('.request-count').textContent().catch(() => '0'))?.trim() || 0);
  if (!count) return;
  await header.click({ button: 'right' });
  await sidebar.locator('.context-item', { hasText: 'Clear All' }).click();
  // Nouto confirms with a VS Code modal dialog
  await page.locator('.monaco-dialog-box').getByRole('button', { name: 'Clear', exact: true }).click();
  await header.locator('.request-count', { hasText: /^\s*0\s*$/ }).waitFor();
}

/** Marks Nouto's onboarding as done in a webview, so no tips cover the UI. */
async function completeOnboarding(frame: Frame): Promise<boolean> {
  return frame.evaluate(() => {
    const raw = localStorage.getItem('nouto_onboarding');
    if (raw && JSON.parse(raw).hasCompletedOnboarding) return false;
    localStorage.setItem('nouto_onboarding', JSON.stringify({ hasCompletedOnboarding: true, dismissedHints: [] }));
    return true;
  });
}

/**
 * Brings the window to a clean, recordable state: workspace trusted, Nouto
 * open with no tips, no editors, no notifications. Webview storage persists
 * per view type, so a warm-up request tab clears tips for later ones.
 */
export async function prepareWindow(page: Page): Promise<Frame> {
  const manageTrust = page.locator(MANAGE_TRUST);
  if (await manageTrust.isVisible()) {
    // The demo folder is created for recordings, so trusting it is safe
    await manageTrust.click();
    const trust = page.getByRole('button', { name: /^Trust\b/ }).first();
    await trust.waitFor({ timeout: 10000 }).catch(() => {});
    if (await trust.isVisible()) await trust.click();
    else await page.keyboard.press('Control+Enter');
    await manageTrust.waitFor({ state: 'hidden' });
    // Trusting enables extensions in place; reloading right away loses the decision
    const noutoTab = page.locator(NOUTO_TAB);
    if (!(await noutoTab.waitFor({ timeout: 30000 }).then(() => true, () => false))) {
      await page.waitForTimeout(3000);
      await openWorkbench(page);
    }
  }

  let sidebar = await openNouto(page);
  let changed = await completeOnboarding(sidebar);
  changed = (await completeOnboarding(await openEmptyRequest(page, sidebar))) || changed;
  await runCommand(page, 'View: Close All Editors');
  if (changed) {
    await openWorkbench(page);
    sidebar = await openNouto(page);
  }

  await runCommand(page, 'View: Close All Editors');
  // A recording that failed mid-edit leaves a dirty editor behind; drop its changes
  const dontSave = page.locator('.monaco-dialog-box').getByRole('button', { name: "Don't Save" });
  if (await dontSave.isVisible()) await dontSave.click();
  await runCommand(page, 'Notifications: Clear All Notifications');
  await clearDrafts(page, sidebar);
  await page.waitForTimeout(800);
  return sidebar;
}

/** README GIF size: 1280x720 at 2x density, so 2560x1440 frames. */
export const GIF_WINDOW: WindowSize = { width: 1280, height: 720, deviceScaleFactor: 2 };

/**
 * Seeds Nouto's data, opens a prepared VS Code window, and runs `record`.
 * On failure it saves output/<name>.failure.png before rethrowing.
 */
export async function withVsCode(
  name: string,
  seed: SeedOptions,
  record: (page: Page, sidebar: Frame) => Promise<void>,
  size: WindowSize = GIF_WINDOW
): Promise<void> {
  seedNoutoState(seed);
  const { context, page } = await launchVsCode(size);
  try {
    await record(page, await prepareWindow(page));
  } catch (error) {
    await page.screenshot({ path: `${OUTPUT_DIR}/${name}.failure.png` }).catch(() => {});
    throw error;
  } finally {
    await context.close();
  }
}
