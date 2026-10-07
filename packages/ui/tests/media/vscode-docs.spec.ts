/**
 * Screenshots for the documentation site (packages/website), captured in real
 * VS Code (`code serve-web`). Each test seeds its own data and writes one PNG
 * to packages/website/src/assets/screenshots/. Refresh them all after a UI
 * change with `pnpm -F @nouto/ui run media:docs-shots`, or one with `-g <file>`.
 */
import { test, expect, type Frame } from '@playwright/test';
import { captureShot } from './screenshots';
import { collection, environment, folder, request } from './state';
import { frameWith, openEmptyRequest, runCommand, stackPanels, withVsCode, type WindowSize } from './vscodeWeb';

test.describe.configure({ mode: 'serial' });

/** Request and response crops: the editor area comes out about 780 px wide. */
const PANEL_WINDOW: WindowSize = { width: 1100, height: 800, deviceScaleFactor: 2 };

const POSTS_URL = 'https://jsonplaceholder.typicode.com/posts/1';

async function sendAndWait(panel: Frame): Promise<void> {
  await panel.locator('.send-button-wrapper .send-button').click();
  await expect(panel.locator('.response-header .status')).toHaveText(/200\s+OK/, { timeout: 30000 });
}

/** Fails when `scroller` has to scroll, so a crop never loses content below the fold. */
async function expectFits(scroller: ReturnType<Frame['locator']>): Promise<void> {
  const overflow = await scroller.evaluate((el) => el.scrollHeight - el.clientHeight);
  expect(overflow, 'content is taller than its pane; make the window taller').toBeLessThanOrEqual(1);
}

function requestTab(panel: Frame, label: string) {
  return panel.locator('.request-panel .panel-tab', { hasText: new RegExp(`^\\s*${label}\\b`) }).first();
}

test('getting-started/quick-start.png', async () => {
  await withVsCode('docs-quick-start', { collapseSample: true }, async (page, sidebar) => {
    const panel = await openEmptyRequest(page, sidebar);
    await stackPanels(page, panel, 0.6);
    await panel.locator('.url-input').fill(POSTS_URL);
    await sendAndWait(panel);
    // No hover tooltip on Send, and no unrelated activity bar badges
    await page.mouse.move(700, 700);
    await page.addStyleTag({ content: '.activitybar .badge { display: none !important; }' });
    await page.waitForTimeout(800);
    await captureShot(page, page, 'getting-started/quick-start.png');
  });
});

test('features/collections-sidebar.png', async () => {
  const myApi = collection('My API', [
    folder('Auth', [
      request({ name: 'Login', method: 'POST', url: 'https://api.example.com/auth/login' }),
      request({ name: 'Refresh Token', method: 'POST', url: 'https://api.example.com/auth/refresh' }),
    ]),
    folder('Users', [
      request({ name: 'Get All', method: 'GET', url: 'https://api.example.com/users' }),
      request({ name: 'Get One', method: 'GET', url: 'https://api.example.com/users/1' }),
      request({ name: 'Create', method: 'POST', url: 'https://api.example.com/users' }),
    ]),
  ]);
  await withVsCode('docs-collections', { collections: [myApi], collapseSample: true }, async (page, sidebar) => {
    const lastRequest = sidebar.locator('.request-item', { hasText: 'Create' }).last();
    await lastRequest.waitFor();
    await page.waitForTimeout(500);
    // From the New Request button down to the last request in the tree
    await captureShot(page, [sidebar.locator('.new-request-button'), lastRequest], 'features/collections-sidebar.png', {
      padding: 10,
    });
  });
});

test('authentication/oauth2-panel.png', async () => {
  await withVsCode(
    'docs-oauth2',
    {},
    async (page, sidebar) => {
      const panel = await openEmptyRequest(page, sidebar);
      // A tall request pane, so the whole form fits without scrolling
      await stackPanels(page, panel, 0.12);
      await panel.locator('.url-input').fill('https://api.example.com/me');
      await requestTab(panel, 'Auth').click();
      await panel.locator('select#auth-type-select').selectOption('oauth2');
      await panel.locator('#oauth-auth-url').fill('https://auth.example.com/oauth/authorize');
      await panel.locator('#oauth-token-url').fill('https://auth.example.com/oauth/token');
      await panel.locator('#oauth-client-id').fill('my-client-id');
      await panel.locator('#oauth-scope').fill('read write');
      await panel.locator('.oauth2-fields .checkbox-field input[type=checkbox]').first().check();
      await page.mouse.move(5, 5);
      await page.waitForTimeout(500);
      await expectFits(panel.locator('.request-panel .panel-content').first());
      await captureShot(page, panel.locator('.auth-editor'), 'authentication/oauth2-panel.png');
    },
    { width: 1100, height: 1150, deviceScaleFactor: 2 }
  );
});

test('variables/environments-panel.png', async () => {
  const local = environment('Local', { baseUrl: 'http://localhost:3000', apiKey: 'dev-key' }, '#4CAF50');
  const staging = environment('Staging', { baseUrl: 'https://staging.example.com', apiKey: 'stg-key-123' }, '#FF9800');
  const production = environment('Production', { baseUrl: 'https://api.example.com', apiKey: 'prod-key-456' }, '#F44336');
  await withVsCode(
    'docs-environments',
    { collapseSample: true, environments: { environments: [local, staging, production], activeId: local.id } },
    async (page) => {
      // More room for the Value column; the side bar comes back after the shot
      await runCommand(page, 'View: Toggle Primary Side Bar Visibility');
      await runCommand(page, 'Nouto: Environments');
      const envPanel = await frameWith(page, '.env-item');
      await envPanel.locator('.env-item', { hasText: 'Staging' }).first().click();
      await envPanel.locator('.env-editor-pane .kv-row').nth(1).waitFor();
      await page.mouse.move(5, 5);
      await page.waitForTimeout(500);
      // The panel fills the window; end the shot below the Add button
      await captureShot(page, envPanel.locator('.tab-content.env-split'), 'variables/environments-panel.png', {
        until: envPanel.locator('.env-editor-pane .add-row-btn'),
      });
      await runCommand(page, 'View: Toggle Primary Side Bar Visibility');
    },
    PANEL_WINDOW
  );
});

test('response/timing-breakdown.png', async () => {
  await withVsCode(
    'docs-timing',
    {},
    async (page, sidebar) => {
      const panel = await openEmptyRequest(page, sidebar);
      await stackPanels(page, panel, 0.8);
      // Big enough that the download phase takes measurable time
      await panel.locator('.url-input').fill('https://jsonplaceholder.typicode.com/comments');
      await sendAndWait(panel);
      await panel.locator('.response-panel .panel-tab', { hasText: /^\s*Timing\b/ }).first().click();
      await expect(panel.locator('.waterfall-row')).toHaveCount(5);
      await page.mouse.move(5, 5);
      await page.waitForTimeout(500);
      await expectFits(panel.locator('.response-panel .response-content').first());
      await captureShot(
        page,
        [panel.locator('.response-panel .response-header'), panel.locator('.timing-breakdown')],
        'response/timing-breakdown.png',
        { padding: 0 }
      );
    },
    { width: 1100, height: 1000, deviceScaleFactor: 2 }
  );
});

test('tools/code-generation.png', async () => {
  await withVsCode(
    'docs-codegen',
    {},
    async (page, sidebar) => {
      const panel = await openEmptyRequest(page, sidebar);
      await panel.locator('.method-select').click();
      await panel.locator('.method-option', { hasText: /^\s*POST\s*$/ }).click();
      await panel.locator('.url-input').fill('https://api.example.com/data');

      await requestTab(panel, 'Body').click();
      await panel.locator('.body-type-btn', { hasText: /^\s*JSON\s*$/ }).click();
      await panel.locator('.body-content .cm-content').first().click();
      // insertText skips the editor's bracket and quote auto-closing
      await page.keyboard.insertText('{\n  "name": "Example"\n}');

      await requestTab(panel, 'Auth').click();
      await panel.locator('select#auth-type-select').selectOption('bearer');
      await panel.locator('input[placeholder="Enter bearer token"]').fill('example-token');

      await panel.locator('button.secondary-btn', { hasText: 'Code' }).click();
      const codegen = panel.locator('.codegen-panel');
      await codegen.waitFor();
      // The last language used is remembered; the page describes cURL
      await codegen.locator('.lang-btn', { hasText: /^\s*cURL\s*$/ }).click();
      await panel.evaluate(() => window.getSelection()?.removeAllRanges());
      await page.mouse.move(5, 5);
      await page.waitForTimeout(500);
      // The modal's own edge frames it; padding would show the dimmed page behind
      await captureShot(page, codegen, 'tools/code-generation.png', { padding: 0 });
    },
    PANEL_WINDOW
  );
});
