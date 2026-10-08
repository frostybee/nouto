/**
 * Screenshots for the documentation site (packages/website), captured in real
 * VS Code (`code serve-web`). Each test seeds its own data and writes one PNG
 * to packages/website/src/assets/screenshots/. Refresh them all after a UI
 * change with `pnpm -F @nouto/ui run media:docs-shots`, or one with `-g <file>`.
 */
import { spawn, type ChildProcess } from 'child_process';
import { createServer, type Server } from 'http';
import { fileURLToPath } from 'url';
import { test, expect, type Frame, type Locator, type Page } from '@playwright/test';
import { captureShot, captureWindow } from './screenshots';
import { collection, cookieJar, environment, folder, historyEntry, mockRoute, request } from './state';
import {
  frameWith,
  openEmptyRequest,
  openSavedRequest,
  runCommand,
  setOpenApiLinting,
  setSectionExpanded,
  sidebarMenu,
  sidebarSection,
  stackPanels,
  withVsCode,
  type WindowSize,
} from './vscodeWeb';

test.describe.configure({ mode: 'serial' });

/** Request and response crops: the editor area comes out about 780 px wide. */
const PANEL_WINDOW: WindowSize = { width: 1100, height: 800, deviceScaleFactor: 2 };
/** For forms that need a tall request pane. */
const TALL_WINDOW: WindowSize = { width: 1100, height: 1150, deviceScaleFactor: 2 };

const POSTS_URL = 'https://jsonplaceholder.typicode.com/posts/1';

/**
 * CSS selector for a view container's activity bar entry, by its container id.
 * Its label moves between the item and its link, so match the link's class.
 */
function activityBarEntry(containerId: string): string {
  return `.activitybar li:has(> a[class*="view-extension-${containerId}-"])`;
}

/** The standalone JSON Explorer extension shares the server; full-window Nouto shots leave it out. */
const HIDE_JSON_EXPLORER = `${activityBarEntry('nouto-json-explorer')} { display: none !important; }`;

/** No hover tooltips or highlights in the shot. */
async function settle(page: Page): Promise<void> {
  await page.mouse.move(5, 5);
  await page.waitForTimeout(500);
}

/**
 * Closes a button's tooltip after a scripted click. A quick hover and click
 * schedule two shows in Tooltip.svelte and leaving cancels only one, so the
 * tooltip stays open; hovering the button again and leaving closes it.
 */
async function closeStuckTooltip(page: Page, button: Locator, elsewhere: Locator): Promise<void> {
  await button.hover();
  await page.waitForTimeout(400);
  await elsewhere.hover();
}

/** Hides the side bar so an editor panel gets the window's width; run it again to bring it back. */
async function toggleSideBar(page: Page): Promise<void> {
  await runCommand(page, 'View: Toggle Primary Side Bar Visibility');
}

/**
 * Starts the repository's gRPC test server (test-servers/grpc-test) on
 * localhost:50051 with server reflection. Its dependencies are installed in
 * that folder, not in the workspace.
 */
async function startGrpcServer(): Promise<ChildProcess> {
  const cwd = fileURLToPath(new URL('../../../../test-servers/grpc-test/', import.meta.url));
  const server = spawn(process.execPath, ['server.js'], { cwd });
  await new Promise<void>((resolve, reject) => {
    let output = '';
    server.stdout!.on('data', (chunk) => {
      output += chunk;
      if (output.includes('test server running')) resolve();
    });
    server.stderr!.on('data', (chunk) => (output += chunk));
    server.on('exit', (code) => reject(new Error(`gRPC test server exited (${code}): ${output}`)));
  });
  return server;
}

const SSE_PORT = 4010;
const SSE_EVENTS = [
  { event: 'message', data: '{"text":"Order 1042 received"}' },
  { event: 'price', data: '{"symbol":"ACME","price":101.25}' },
  { event: 'price', data: '{"symbol":"ACME","price":101.31}' },
  { event: 'ping', data: '{}' },
  { event: 'message', data: '{"text":"Order 1042 shipped"}' },
  { event: 'price', data: '{"symbol":"ACME","price":100.98}' },
];

/**
 * Serves SSE_EVENTS on http://127.0.0.1:SSE_PORT/events about 300 ms apart,
 * then only keepalive comments, so the connection stays open and the log
 * stops growing. Lines end in LF: Nouto splits events on a blank LF line.
 */
async function startSseServer(): Promise<Server> {
  const server = createServer((req, res) => {
    if (req.url !== '/events') {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    let next = 0;
    const timer = setInterval(() => {
      if (next < SSE_EVENTS.length) {
        const { event, data } = SSE_EVENTS[next++];
        res.write(`id: ${next}\nevent: ${event}\ndata: ${data}\n\n`);
      } else {
        res.write(': keepalive\n\n');
      }
    }, 300);
    req.on('close', () => clearInterval(timer));
  });
  await new Promise<void>((resolve) => server.listen(SSE_PORT, '127.0.0.1', resolve));
  return server;
}

function stopServer(server: Server): Promise<void> {
  server.closeAllConnections();
  return new Promise((resolve) => server.close(() => resolve()));
}

const MOCK_PORT = 3901;
const MOCK_ROUTES = [
  mockRoute({
    method: 'GET',
    path: '/users/:id',
    headers: { 'Content-Type': 'application/json' },
    responseBody: '{\n  "userId": "{{id}}",\n  "name": "Mock User"\n}',
    latencyMin: 100,
    latencyMax: 300,
    description: 'One user, with the id from the path',
  }),
  mockRoute({
    method: 'GET',
    path: '/users',
    headers: { 'Content-Type': 'application/json' },
    responseBody: '[\n  { "id": 1, "name": "Ada Lovelace" },\n  { "id": 2, "name": "Alan Turing" }\n]',
  }),
  mockRoute({
    method: 'POST',
    path: '/users',
    statusCode: 201,
    headers: { 'Content-Type': 'application/json' },
    responseBody: '{ "id": 3 }',
  }),
  mockRoute({ method: 'DELETE', path: '/users/:id', statusCode: 204 }),
];

/** Opens a workspace file with Quick Open, after closing whatever the window restored. */
async function quickOpen(page: Page, file: string): Promise<void> {
  // A custom editor from the previous run can come back after the window opens
  await runCommand(page, 'View: Close All Editors');
  await page.keyboard.press('Control+P');
  await page.locator('.quick-input-widget input').fill(file);
  // The list starts with recent files; wait for the filter to put this one first
  await page.locator('.quick-input-widget .monaco-list-row.focused', { hasText: file }).waitFor();
  await page.waitForTimeout(300);
  await page.keyboard.press('Enter');
  await page.locator('.tab.active', { hasText: file }).waitFor();
}

/** JSON Explorer crops: with the side bar hidden, the editor comes out about 820 px wide, enough for the toolbar. */
const EXPLORER_WINDOW: WindowSize = { width: 880, height: 800, deviceScaleFactor: 2 };

/**
 * Opens a workspace file in the standalone JSON Explorer extension and returns
 * its frame. The header shows the current time, which the shots leave out.
 */
async function openInJsonExplorer(page: Page, file: string): Promise<Frame> {
  await quickOpen(page, file);
  // The explorer replaces the text editor's tab
  await runCommand(page, 'Nouto JSON Explorer: Open with JSON Explorer');
  const explorer = await frameWith(page, '.explorer-toolbar');
  await hideExplorerTime(explorer);
  return explorer;
}

async function hideExplorerTime(explorer: Frame): Promise<void> {
  await explorer.addStyleTag({ content: '.request-time { display: none !important; }' });
}

/** Fails when the JSON Explorer toolbar is wider than its panel and scrolls sideways. */
async function expectToolbarFits(explorer: Frame): Promise<void> {
  const overflow = await explorer.locator('.explorer-toolbar').evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(overflow, 'the JSON Explorer toolbar overflows; make the window wider').toBeLessThanOrEqual(1);
}

/** A saved request with a pre-request and a post-response script; one of its three tests fails. */
const SCRIPTED_REQUEST = request({
  name: 'Get user',
  method: 'GET',
  url: 'https://jsonplaceholder.typicode.com/users/1',
  scripts: {
    preRequest: [
      "nt.request.setHeader('X-Request-ID', nt.uuid());",
      "console.log('Sending ' + nt.request.method + ' ' + nt.request.url);",
    ].join('\n'),
    postResponse: [
      'const user = nt.response.json();',
      '',
      "nt.test('Status is 200', () => {",
      '  expect(nt.response.status).to.equal(200);',
      '});',
      "nt.test('User has an email', () => {",
      "  expect(user.email).to.include('@');",
      '});',
      "nt.test('User works at Acme', () => {",
      "  expect(user.company.name).to.equal('Acme');",
      '});',
      '',
      "console.log('Fetched ' + user.name);",
    ].join('\n'),
  },
});

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
    await page.addStyleTag({ content: `.activitybar .badge { display: none !important; } ${HIDE_JSON_EXPLORER}` });
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

test('building-requests/body-types.png', async () => {
  // A saved request, so no "not saved" banner sits between the URL bar and the tabs
  const myApi = collection('My API', [
    request({
      name: 'Create User',
      method: 'POST',
      url: 'https://api.example.com/users',
      body: { type: 'json', content: '{\n  "name": "Ada Lovelace",\n  "email": "ada@example.com"\n}' },
    }),
  ]);
  await withVsCode(
    'docs-body-types',
    { collections: [myApi], collapseSample: true },
    async (page, sidebar) => {
      const panel = await openSavedRequest(page, sidebar, 'Create User');
      await stackPanels(page, panel, 0.35);
      await requestTab(panel, 'Body').click();
      await panel.locator('.body-type-btn.active', { hasText: /^\s*JSON\s*$/ }).waitFor();
      await settle(page);
      await captureShot(page, [panel.locator('.url-bar'), panel.locator('.body-editor')], 'building-requests/body-types.png', {
        until: panel.locator('.body-content .cm-line').last(),
        within: panel.locator('html'),
      });
    },
    PANEL_WINDOW
  );
});

test('building-requests/headers-autocomplete.png', async () => {
  await withVsCode(
    'docs-headers',
    {},
    async (page, sidebar) => {
      const panel = await openEmptyRequest(page, sidebar);
      // The suggestion list is clipped by the request pane, so give it the height
      await stackPanels(page, panel, 0.2);
      await panel.locator('.url-input').fill('https://api.example.com/users');
      await requestTab(panel, 'Headers').click();
      // New requests start with a User-Agent row, so the button reads "Add"
      await panel.locator('.request-panel .kv-editor .add-row-btn').click();
      const key = panel.locator('.request-panel .kv-row').last().locator('.col-key input');
      await key.click();
      await key.pressSequentially('Accept', { delay: 60 });
      const dropdown = panel.locator('.autocomplete-dropdown');
      // Hovering a suggestion shows its description
      await dropdown.locator('.suggestion-item', { hasText: /^\s*Accept-Encoding\b/ }).first().hover();
      const tooltip = panel.locator('.suggestion-tooltip');
      await tooltip.waitFor();
      await page.waitForTimeout(500);
      await captureShot(page, [panel.locator('.request-panel .kv-editor'), dropdown, tooltip], 'building-requests/headers-autocomplete.png');
    },
    PANEL_WINDOW
  );
});

test('variables/variable-substitution-autocomplete.png', async () => {
  await withVsCode(
    'docs-dynamic-variables',
    {},
    async (page, sidebar) => {
      const panel = await openEmptyRequest(page, sidebar);
      await stackPanels(page, panel, 0.5);
      const url = panel.locator('.url-input');
      await url.fill('https://api.example.com/users/');
      // The list closes when the input loses focus, so the mouse stays out of the frame
      await page.mouse.move(5, 5);
      await url.pressSequentially('{{$', { delay: 80 });
      const dropdown = panel.locator('.url-input-wrapper .url-var-dropdown');
      await dropdown.locator('.url-var-item').first().waitFor();
      await page.waitForTimeout(500);
      await captureShot(page, [panel.locator('.url-bar'), dropdown], 'variables/variable-substitution-autocomplete.png', {
        within: panel.locator('html'),
      });
    },
    PANEL_WINDOW
  );
});

test('authentication/auth-tab-overview.png', async () => {
  const myApi = collection('My API', [
    request({
      name: 'Get Profile',
      method: 'GET',
      url: 'https://api.example.com/me',
      authInheritance: 'own',
      auth: { type: 'bearer', token: 'my-secret-token' },
    }),
  ]);
  await withVsCode(
    'docs-auth-overview',
    { collections: [myApi], collapseSample: true },
    async (page, sidebar) => {
      const panel = await openSavedRequest(page, sidebar, 'Get Profile');
      await stackPanels(page, panel, 0.4);
      await requestTab(panel, 'Auth').click();
      await panel.locator('select#auth-type-select').waitFor();
      await settle(page);
      await captureShot(
        page,
        [panel.locator('.url-bar'), panel.locator('.auth-inheritance'), panel.locator('.auth-editor')],
        'authentication/auth-tab-overview.png',
        { within: panel.locator('html') }
      );
    },
    PANEL_WINDOW
  );
});

test('authentication/auth-inheritance-request.png', async () => {
  // Auth on the collection, so "Using auth from" names where it really comes from
  const myApi = collection(
    'My API',
    [request({ name: 'List Users', method: 'GET', url: 'https://api.example.com/users', authInheritance: 'inherit' })],
    { auth: { type: 'basic', username: 'admin', password: 'my-secret-password' } }
  );
  await withVsCode(
    'docs-auth-inherit',
    { collections: [myApi], collapseSample: true },
    async (page, sidebar) => {
      const panel = await openSavedRequest(page, sidebar, 'List Users');
      await stackPanels(page, panel, 0.5);
      await requestTab(panel, 'Auth').click();
      await panel.locator('.auth-inheritance .inherited-info').waitFor();
      await settle(page);
      await captureShot(
        page,
        [panel.locator('.url-bar'), panel.locator('.auth-inheritance')],
        'authentication/auth-inheritance-request.png',
        { within: panel.locator('html') }
      );
    },
    PANEL_WINDOW
  );
});

test('authentication/auth-inheritance-folder.png', async () => {
  const myApi = collection('My API', [
    folder('Users', [request({ name: 'List Users', method: 'GET', url: 'https://api.example.com/users' })], {
      auth: { type: 'basic', username: 'admin', password: 'my-secret-password' },
    }),
  ]);
  await withVsCode(
    'docs-auth-folder',
    { collections: [myApi], collapseSample: true },
    async (page, sidebar) => {
      await sidebarMenu(sidebar, sidebar.locator('.folder-header', { hasText: 'Users' }).first(), 'Settings...');
      const settings = await frameWith(page, '.settings-panel .tab-btn');
      await settings.locator('#auth-password').waitFor();
      await settle(page);
      // The panel's own edges frame it; padding would show the editor tab strip
      await captureShot(page, settings.locator('.settings-panel'), 'authentication/auth-inheritance-folder.png', {
        padding: 0,
        until: settings.locator('.auth-editor'),
      });
    },
    PANEL_WINDOW
  );
});

test('testing/assertions-tab.png', async () => {
  const myApi = collection('My API', [
    request({
      name: 'Get Post',
      method: 'GET',
      url: POSTS_URL,
      assertions: [
        { target: 'status', operator: 'equals', expected: '200' },
        { target: 'responseTime', operator: 'lessThan', expected: '2000' },
        { target: 'jsonQuery', property: '$.id', operator: 'exists' },
        // Fails on purpose: post 1 belongs to user 1
        { target: 'jsonQuery', property: '$.userId', operator: 'equals', expected: '2' },
      ],
    }),
  ]);
  await withVsCode(
    'docs-assertions',
    { collections: [myApi], collapseSample: true },
    async (page, sidebar) => {
      const panel = await openSavedRequest(page, sidebar, 'Get Post');
      await stackPanels(page, panel, 0.35);
      await requestTab(panel, 'Tests').click();
      await sendAndWait(panel);
      const editor = panel.locator('.assertion-editor');
      await expect(editor.locator('.summary')).toHaveText(/3\/4 passed/);
      await settle(page);
      await expectFits(panel.locator('.request-panel .panel-content').first());
      await captureShot(page, editor, 'testing/assertions-tab.png');
    },
    PANEL_WINDOW
  );
});

test('testing/runner-panel.png', async () => {
  const api = 'https://jsonplaceholder.typicode.com';
  const jsonPlaceholder = collection('JSONPlaceholder', [
    request({ name: 'Get post', method: 'GET', url: `${api}/posts/1` }),
    request({ name: 'Get user', method: 'GET', url: `${api}/users/1` }),
    request({ name: 'List comments', method: 'GET', url: `${api}/comments?postId=1` }),
    request({
      name: 'Create post',
      method: 'POST',
      url: `${api}/posts`,
      headers: [{ key: 'Content-Type', value: 'application/json' }],
      body: { type: 'json', content: '{\n  "title": "Hello",\n  "body": "From the runner",\n  "userId": 1\n}' },
    }),
    // Post 0 doesn't exist, so the run shows a failed request
    request({ name: 'Get missing post', method: 'GET', url: `${api}/posts/0` }),
  ]);
  await withVsCode(
    'docs-runner',
    { collections: [jsonPlaceholder], collapseSample: true },
    async (page, sidebar) => {
      await sidebarMenu(sidebar, sidebar.locator('.collection-header', { hasText: 'JSONPlaceholder' }).first(), 'Run All');
      const runner = await frameWith(page, '.run-button');
      await runner.locator('.run-button').click();
      await expect(runner.locator('table.results-table tr.result-row')).toHaveCount(5, { timeout: 60000 });
      await runner.locator('.summary-section').waitFor();
      await settle(page);
      await captureShot(page, [runner.locator('.summary-section'), runner.locator('table.results-table')], 'testing/runner-panel.png');
    },
    PANEL_WINDOW
  );
});

test('import-export/import-result-sidebar.png', async () => {
  await withVsCode(
    'docs-import',
    { collapseSample: true, workspaceFiles: ['tvmaze.postman_collection.json'] },
    async (page, sidebar) => {
      // The same steps as README GIF #5
      await sidebar.locator('.toolbar-button[aria-label="Import / Export"]').click();
      await sidebar.locator('.import-item', { hasText: 'Import Collection' }).click();
      const fileRow = page.locator('.quick-input-widget .monaco-list-row', { hasText: 'tvmaze.postman_collection.json' });
      await fileRow.click();
      await page.waitForTimeout(300);
      if (await page.locator('.quick-input-widget').isVisible()) await page.keyboard.press('Enter');
      await expect(sidebar.locator('.collection-header', { hasText: 'TVmaze API' })).toBeVisible({ timeout: 15000 });
      await runCommand(page, 'Notifications: Clear All Notifications');
      await closeStuckTooltip(
        page,
        sidebar.locator('.toolbar-button[aria-label="Import / Export"]'),
        sidebar.locator('.collection-header', { hasText: 'Drafts' })
      );
      await settle(page);
      await captureShot(
        page,
        [sidebar.locator('.new-request-button'), sidebar.locator('.request-item').last()],
        'import-export/import-result-sidebar.png',
        { padding: 10 }
      );
    },
    PANEL_WINDOW
  );
});

test('features/graphql-body.png', async () => {
  const countries = collection('Countries API', [
    request({
      name: 'Get Country',
      method: 'POST',
      url: 'https://countries.trevorblades.com/graphql',
      body: {
        type: 'graphql',
        content: 'query GetCountry($code: ID!) {\n  country(code: $code) {\n    name\n    capital\n    currency\n  }\n}',
        graphqlVariables: '{\n  "code": "CA"\n}',
      },
    }),
  ]);
  await withVsCode(
    'docs-graphql',
    { collections: [countries], collapseSample: true },
    async (page, sidebar) => {
      const panel = await openSavedRequest(page, sidebar, 'Get Country');
      // The query editor stretches to fill the pane; this keeps the shot compact
      await stackPanels(page, panel, 0.2);
      await requestTab(panel, 'Body').click();
      await panel.locator('.graphql-toolbar .fetch-btn').click();
      const explorer = panel.locator('.explorer-panel');
      // The explorer re-renders as the schema arrives, which can collapse a section again
      const queries = explorer.locator('.section', { has: panel.locator('.section-name', { hasText: 'Queries' }) });
      await queries.locator('.count-badge').waitFor({ timeout: 30000 });
      await expect(async () => {
        if (!(await queries.locator('.section-content').count())) await queries.locator('.section-header').click();
        await expect(queries.locator('.section-content')).toBeVisible({ timeout: 1000 });
      }).toPass({ timeout: 15000 });
      await page.waitForTimeout(1000);
      await expect(queries.locator('.section-content')).toBeVisible();
      await settle(page);
      await expectFits(panel.locator('.request-panel .panel-content').first());
      await captureShot(page, panel.locator('.graphql-editor-wrapper'), 'features/graphql-body.png');
    },
    PANEL_WINDOW
  );
});

test('features/websocket-panel.png', async () => {
  const echo = collection('Realtime', [
    request({ name: 'Echo', method: 'GET', url: 'wss://echo.websocket.org', connectionMode: 'websocket' }),
  ]);
  await withVsCode(
    'docs-websocket',
    { collections: [echo], collapseSample: true },
    async (page, sidebar) => {
      const panel = await openSavedRequest(page, sidebar, 'Echo', '.ws-panel');
      await panel.locator('.url-bar .send-button', { hasText: 'Connect' }).click();
      await expect(panel.locator('.ws-panel .status-text')).toHaveText(/^\s*connected\s*$/i, { timeout: 20000 });
      await panel.locator('.message-input').fill('{"type":"subscribe","channel":"orders"}');
      await panel.locator('.send-btn').click();
      await expect(panel.locator('.message-row.sent')).toHaveCount(1);
      await expect.poll(() => panel.locator('.message-row.received').count(), { timeout: 10000 }).toBeGreaterThanOrEqual(2);
      await panel.locator('.message-input').evaluate((el) => (el as HTMLElement).blur());
      await settle(page);
      await captureShot(page, [panel.locator('.url-bar'), panel.locator('.ws-panel')], 'features/websocket-panel.png', {
        within: panel.locator('html'),
      });
    },
    // Short, so the three-message log doesn't leave a large gap above the composer
    { width: 1100, height: 560, deviceScaleFactor: 2 }
  );
});

test('features/grpc-panel.png', async () => {
  const users = collection('Users gRPC', [
    request({
      name: 'Get User',
      method: 'POST',
      url: 'localhost:50051',
      connectionMode: 'grpc',
      // The scaffold Nouto fills in when you pick GetUser, saved with the request
      body: { type: 'json', content: '{\n  "id": ""\n}' },
      grpc: {
        useReflection: true,
        protoPaths: [],
        protoImportDirs: [],
        serviceName: 'users.UserService',
        methodName: 'GetUser',
      },
    }),
  ]);
  const server = await startGrpcServer();
  try {
    await withVsCode(
      'docs-grpc',
      { collections: [users], collapseSample: true },
      async (page, sidebar) => {
        const panel = await openSavedRequest(page, sidebar, 'Get User', '.grpc-panel');
        await expect(panel.locator('.status-badge.loaded')).toBeVisible({ timeout: 30000 });
        await expect(panel.locator('.method-trigger')).toContainText('GetUser');
        // Room for the Message editor below the method picker
        await stackPanels(page, panel, 0.2);
        const message = panel.locator('.grpc-panel .cm-content');
        await expect(message).toContainText('"id"');
        await settle(page);
        await captureShot(page, [panel.locator('.url-bar'), panel.locator('.grpc-panel')], 'features/grpc-panel.png', {
          until: message.locator('.cm-line').last(),
          within: panel.locator('html'),
        });
      },
      TALL_WINDOW
    );
  } finally {
    server.kill();
  }
});

test('features/sse-event-log.png', async () => {
  const events = collection('Realtime', [
    request({ name: 'Order events', method: 'GET', url: `http://127.0.0.1:${SSE_PORT}/events`, connectionMode: 'sse' }),
  ]);
  const server = await startSseServer();
  try {
    await withVsCode(
      'docs-sse',
      { collections: [events], collapseSample: true },
      async (page, sidebar) => {
        const panel = await openSavedRequest(page, sidebar, 'Order events', '.sse-panel');
        await panel.locator('.sse-panel .connect-btn').click();
        await expect(panel.locator('.sse-panel .status-text')).toHaveText(/^\s*connected\s*$/i, { timeout: 15000 });
        await expect(panel.locator('.event-row')).toHaveCount(SSE_EVENTS.length, { timeout: 15000 });
        await settle(page);
        await captureShot(page, [panel.locator('.url-bar'), panel.locator('.sse-panel')], 'features/sse-event-log.png', {
          until: panel.locator('.event-row').last(),
          within: panel.locator('html'),
        });
        await panel.locator('.sse-panel .disconnect-btn').click();
      },
      PANEL_WINDOW
    );
  } finally {
    await stopServer(server);
  }
});

test('tools/mock-server-routes.png', async () => {
  await withVsCode(
    'docs-mock-routes',
    { collapseSample: true, mocks: { port: MOCK_PORT, routes: MOCK_ROUTES } },
    async (page) => {
      await runCommand(page, 'Nouto: Open Mock Server');
      const mock = await frameWith(page, '.mock-panel .routes-list');
      // Expand the first route to show its response body and latency
      await mock.locator('.route-row').first().locator('.expand-btn').click();
      await mock.locator('.routes-list textarea').first().waitFor();
      await settle(page);
      await captureShot(page, [mock.locator('.header'), mock.locator('.routes-list')], 'tools/mock-server-routes.png');
    },
    TALL_WINDOW
  );
});

test('tools/mock-server-log.png', async () => {
  await withVsCode(
    'docs-mock-log',
    { collapseSample: true, mocks: { port: MOCK_PORT, routes: MOCK_ROUTES } },
    async (page) => {
      await runCommand(page, 'Nouto: Open Mock Server');
      const mock = await frameWith(page, '.mock-panel .routes-list');
      await mock.locator('.start-btn').click();
      await expect(mock.locator('.status-badge.running')).toHaveText(`Running on :${MOCK_PORT}`);
      try {
        // A frontend or test suite calling the mock; the last path has no route
        const base = `http://127.0.0.1:${MOCK_PORT}`;
        await fetch(`${base}/users`);
        await fetch(`${base}/users/42`);
        await fetch(`${base}/users`, { method: 'POST', body: '{"name":"Grace Hopper"}' });
        await fetch(`${base}/orders`);
        await mock.locator('.tab', { hasText: 'Request Log' }).click();
        await expect(mock.locator('.log-table-container tbody tr')).toHaveCount(4);
        await settle(page);
        await captureShot(page, [mock.locator('.header'), mock.locator('.log-table-container')], 'tools/mock-server-log.png');
      } finally {
        await mock.locator('.stop-btn').click();
        await expect(mock.locator('.status-badge.stopped')).toBeVisible();
      }
    },
    PANEL_WINDOW
  );
});

test('features/benchmark-results.png', async () => {
  const jsonPlaceholder = collection('JSONPlaceholder', [request({ name: 'Get post', method: 'GET', url: POSTS_URL })]);
  await withVsCode(
    'docs-benchmark',
    { collections: [jsonPlaceholder], collapseSample: true },
    async (page, sidebar) => {
      // Benchmarks run on saved requests, from the request's More actions menu
      const panel = await openSavedRequest(page, sidebar, 'Get post');
      await panel.locator('.overflow-btn[aria-label="More actions"]').click();
      await panel.locator('.send-menu-item', { hasText: 'Benchmark' }).click();
      const bench = await frameWith(page, '.benchmark-panel #iterations');
      await bench.locator('#iterations').fill('50');
      await bench.locator('#iterations').press('Tab');
      await bench.locator('#concurrency').fill('5');
      await bench.locator('#concurrency').press('Tab');
      await bench.locator('.start-btn').click();
      await expect(bench.locator('.iteration-section h3')).toHaveText(/Iterations \(50\)/, { timeout: 90000 });
      await settle(page);
      await captureShot(page, [bench.locator('.header'), bench.locator('.distribution-section')], 'features/benchmark-results.png');
    },
    { width: 1100, height: 1300, deviceScaleFactor: 2 }
  );
});

test('testing/scripts-editor.png', async () => {
  await withVsCode(
    'docs-scripts-editor',
    { collections: [collection('JSONPlaceholder', [SCRIPTED_REQUEST])], collapseSample: true },
    async (page, sidebar) => {
      const panel = await openSavedRequest(page, sidebar, 'Get user');
      await stackPanels(page, panel, 0.15);
      await requestTab(panel, 'Scripts').click();
      await panel.locator('.section-tab', { hasText: 'Post-response' }).click();
      await panel.locator('.editor-area .cm-wrapper:not(.hidden) .cm-line', { hasText: 'Fetched' }).waitFor();
      await settle(page);
      // The editor has a minimum height that overflows the pane; the crop ends at the last line
      await expect(panel.locator('.editor-area .cm-wrapper:not(.hidden) .cm-line').last()).toBeInViewport();
      await captureShot(page, [panel.locator('.url-bar'), panel.locator('.script-editor')], 'testing/scripts-editor.png', {
        until: panel.locator('.editor-area .cm-wrapper:not(.hidden) .cm-line').last(),
        within: panel.locator('html'),
      });
    },
    TALL_WINDOW
  );
});

test('testing/script-output.png', async () => {
  await withVsCode(
    'docs-script-output',
    { collections: [collection('JSONPlaceholder', [SCRIPTED_REQUEST])], collapseSample: true },
    async (page, sidebar) => {
      const panel = await openSavedRequest(page, sidebar, 'Get user');
      await stackPanels(page, panel, 0.75);
      await sendAndWait(panel);
      await panel.locator('.response-panel .panel-tab', { hasText: /^\s*Scripts\b/ }).first().click();
      await expect(panel.locator('.script-output .test-header')).toHaveText(/Tests: 2\/3 passed/);
      await settle(page);
      await captureShot(
        page,
        [panel.locator('.response-panel .response-header'), panel.locator('.script-output')],
        'testing/script-output.png',
        { within: panel.locator('.response-panel') }
      );
    },
    PANEL_WINDOW
  );
});

test('response/response-diff.png', async () => {
  await withVsCode(
    'docs-response-diff',
    {},
    async (page, sidebar) => {
      const panel = await openEmptyRequest(page, sidebar);
      await stackPanels(page, panel, 0.75);
      const url = panel.locator('.url-input');
      await url.fill('https://jsonplaceholder.typicode.com/todos/1');
      await sendAndWait(panel);
      // The status stays 200 OK, so wait for the Compare button that a second response adds
      await url.fill('https://jsonplaceholder.typicode.com/todos/4');
      await panel.locator('.send-button-wrapper .send-button').click();
      const compare = panel.locator('.response-panel button[aria-label="Compare with previous response"]');
      await compare.click({ timeout: 30000 });
      await panel.locator('.diff-view .cm-changedText').first().waitFor();
      await closeStuckTooltip(page, compare, panel.locator('.response-panel .response-header .status'));
      await settle(page);
      await captureShot(
        page,
        [panel.locator('.response-panel .response-header'), panel.locator('.response-panel .diff-view')],
        'response/response-diff.png',
        { within: panel.locator('.response-panel'), until: panel.locator('.diff-view .cm-line').last() }
      );
    },
    PANEL_WINDOW
  );
});

test('response/json-explorer.png', async () => {
  const jsonPlaceholder = collection('JSONPlaceholder', [
    request({ name: 'List users', method: 'GET', url: 'https://jsonplaceholder.typicode.com/users' }),
  ]);
  await withVsCode(
    'docs-response-json-explorer',
    { collections: [jsonPlaceholder], collapseSample: true },
    async (page, sidebar) => {
      const panel = await openSavedRequest(page, sidebar, 'List users');
      await sendAndWait(panel);
      await panel.locator('.viewer-toolbar button[aria-label="Open in JSON Explorer"]').click();
      const explorer = await frameWith(page, '.explorer-toolbar');
      await hideExplorerTime(explorer);
      // It opens beside the request; give it the whole editor area
      await runCommand(page, 'View: Toggle Maximize Editor Group');
      await toggleSideBar(page);
      await explorer.locator('.tree-row[data-path="$[0]"]').click();
      await explorer.locator('.tree-row[data-path="$[0].email"]').waitFor();
      await settle(page);
      await expectToolbarFits(explorer);
      await captureShot(page, explorer.locator('.json-explorer-panel'), 'response/json-explorer.png', {
        padding: 0,
        until: explorer.locator('.tree-row').last(),
      });
      await toggleSideBar(page);
    },
    EXPLORER_WINDOW
  );
});

test('json-explorer/open-file.png', async () => {
  await withVsCode(
    'docs-json-explorer-open',
    { workspaceFiles: ['response.json'] },
    async (page) => {
      const explorer = await openInJsonExplorer(page, 'response.json');
      await toggleSideBar(page);
      await explorer.locator('.tree-row[data-path="$[0]"]').click();
      await explorer.locator('.tree-row[data-path="$[0].email"]').waitFor();
      await settle(page);
      await expectToolbarFits(explorer);
      await captureShot(page, explorer.locator('.json-explorer-panel'), 'json-explorer/open-file.png', {
        padding: 0,
        until: explorer.locator('.tree-row').last(),
      });
      await toggleSideBar(page);
    },
    EXPLORER_WINDOW
  );
});

test('json-explorer/query-filter.png', async () => {
  await withVsCode(
    'docs-json-explorer-query',
    { workspaceFiles: ['response.json'] },
    async (page) => {
      const explorer = await openInJsonExplorer(page, 'response.json');
      await toggleSideBar(page);
      await explorer.locator('.explorer-toolbar button[aria-label="Query filter"]').click();
      const query = explorer.locator('.query-bar input.query-input');
      await query.fill('email endsWith ".biz"');
      await query.press('Enter');
      await expect(explorer.locator('.query-bar .result-badge')).toContainText('1 of 3');
      // Let the highlight on the current match finish its flash
      await page.waitForTimeout(1500);
      await settle(page);
      await expectToolbarFits(explorer);
      await captureShot(page, explorer.locator('.json-explorer-panel'), 'json-explorer/query-filter.png', {
        padding: 0,
        until: explorer.locator('.tree-row').last(),
      });
      await toggleSideBar(page);
    },
    EXPLORER_WINDOW
  );
});

test('json-explorer/compare.png', async () => {
  // user.json with one value changed, one key removed, and one added
  const comparison = JSON.stringify(
    {
      id: 42,
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      role: 'editor',
      address: { city: 'London', postcode: 'W1A 1AA' },
      lastLogin: '2026-10-01T09:00:00Z',
    },
    null,
    2
  );
  await withVsCode(
    'docs-json-explorer-compare',
    { workspaceFiles: ['user.json'] },
    async (page) => {
      const explorer = await openInJsonExplorer(page, 'user.json');
      await toggleSideBar(page);
      const compareButton = explorer.locator('.explorer-toolbar button[aria-label="Compare with another JSON"]');
      await compareButton.click();
      await explorer.locator('textarea.compare-input').fill(comparison);
      await explorer.locator('.compare-btn.primary').click();
      await explorer.locator('.diff-summary').waitFor();
      await closeStuckTooltip(page, compareButton, explorer.locator('.diff-summary'));
      await settle(page);
      await expectFits(explorer.locator('.diff-body'));
      await captureShot(page, explorer.locator('.json-explorer-panel'), 'json-explorer/compare.png', {
        padding: 0,
        until: explorer.locator('.diff-body .diff-row').last(),
      });
      await toggleSideBar(page);
    },
    EXPLORER_WINDOW
  );
});

test('json-explorer/generate-types.png', async () => {
  await withVsCode(
    'docs-json-explorer-types',
    { workspaceFiles: ['response.json'] },
    async (page) => {
      const explorer = await openInJsonExplorer(page, 'response.json');
      await toggleSideBar(page);
      // Clicking a row selects it and expands it
      await explorer.locator('.tree-row[data-path="$[0]"]').click();
      await explorer.locator('.tree-row[data-path="$[0].address"]').click();
      await explorer.locator('.tree-row[data-path="$[0].address.geo"]').waitFor();
      const typesButton = explorer.locator('.explorer-toolbar button[aria-label="Generate types"]');
      await typesButton.click();
      const types = explorer.locator('.type-gen-panel');
      await types.locator('pre.generated-code').waitFor();
      await closeStuckTooltip(page, typesButton, types.locator('pre.generated-code'));
      await settle(page);
      await expectFits(types.locator('.type-gen-content'));
      // From the toolbar down to the panel's bottom edge, above the tree
      await captureShot(page, [explorer.locator('.explorer-toolbar'), types], 'json-explorer/generate-types.png', {
        padding: 0,
      });
      await toggleSideBar(page);
    },
    EXPLORER_WINDOW
  );
});

test('tools/request-history.png', async () => {
  // Today, Yesterday, and This Week are counted from local midnight
  const now = new Date();
  const sinceMidnight = now.getHours() * 60 + now.getMinutes();
  const yesterday = (hour: number) => sinceMidnight + (24 - hour) * 60;
  const daysAgo = (days: number, hour: number) => sinceMidnight + (days * 24 - hour) * 60;
  const api = 'https://api.example.com';
  const history = [
    historyEntry({ method: 'GET', url: `${api}/users`, status: 200, durationMs: 142, sizeBytes: 1840, minutesAgo: 2 }),
    historyEntry({ method: 'POST', url: `${api}/users`, status: 201, durationMs: 188, sizeBytes: 96, minutesAgo: 6 }),
    historyEntry({ method: 'GET', url: `${api}/users/42`, status: 200, durationMs: 97, sizeBytes: 412, minutesAgo: 14 }),
    historyEntry({ method: 'PUT', url: `${api}/users/42`, status: 200, durationMs: 133, sizeBytes: 418, minutesAgo: 25 }),
    historyEntry({ method: 'GET', url: `${api}/orders?status=open`, status: 500, durationMs: 1204, sizeBytes: 64, minutesAgo: yesterday(16) }),
    historyEntry({ method: 'DELETE', url: `${api}/users/7`, status: 404, durationMs: 88, sizeBytes: 52, minutesAgo: yesterday(11) }),
    historyEntry({ method: 'GET', url: `${api}/products`, status: 200, durationMs: 256, sizeBytes: 5120, minutesAgo: daysAgo(3, 15) }),
    historyEntry({ method: 'PATCH', url: `${api}/products/9`, status: 200, durationMs: 171, sizeBytes: 230, minutesAgo: daysAgo(4, 10) }),
  ];
  await withVsCode(
    'docs-history',
    { history },
    async (page, sidebar) => {
      await sidebar.locator('.tab-bar .tab-button', { hasText: 'History' }).click();
      await expect(sidebar.locator('.history-item')).toHaveCount(history.length);
      await expect(sidebar.locator('.history-item').last()).toBeInViewport({ ratio: 1 });
      await settle(page);
      await captureShot(
        page,
        [sidebar.locator('.new-request-button'), sidebar.locator('.history-item').last()],
        'tools/request-history.png',
        { padding: 10 }
      );
    },
    TALL_WINDOW
  );
});

test('tools/cookie-jars.png', async () => {
  const defaultJar = cookieJar('Default', [
    { name: 'session_id', value: 'a1b2c3d4e5', domain: 'api.example.com', httpOnly: true, secure: true },
  ]);
  const admin = cookieJar('Admin user', [
    { name: 'session_id', value: '9f8e7d6c5b', domain: 'api.example.com', httpOnly: true, secure: true, sameSite: 'Lax' },
    { name: 'csrf_token', value: 'x7Kq2Lm9', domain: 'api.example.com', sameSite: 'Strict' },
    { name: 'theme', value: 'dark', domain: 'app.example.com' },
  ]);
  const guest = cookieJar('Guest user', [{ name: 'visitor_id', value: 'g-1024', domain: 'app.example.com' }]);
  await withVsCode(
    'docs-cookie-jars',
    { collapseSample: true, cookies: { jars: [defaultJar, admin, guest], activeJarId: admin.id } },
    async (page) => {
      await runCommand(page, 'Nouto: Cookie Jars');
      const jars = await frameWith(page, '.cookie-jar-split');
      const info = jars.locator('.info-toggle-btn');
      if (await info.count()) await info.first().click();
      // Domain groups start collapsed
      await jars.locator('.jar-item', { hasText: 'Admin user' }).click();
      for (const header of await jars.locator('.domain-header').all()) await header.click();
      await expect(jars.locator('.cookie-row')).toHaveCount(3);
      await settle(page);
      // The split's own borders frame it; padding would show the sash and the tabs above
      await captureShot(page, jars.locator('.cookie-jar-split'), 'tools/cookie-jars.png', {
        padding: 0,
        until: jars.locator('.cookie-row').last(),
      });
    },
    PANEL_WINDOW
  );
});

const SPEC = 'tvmaze.openapi.yaml';

/** The outline row with `text`, in the side bar. */
function outlineRow(page: Page, text: string) {
  return page.locator('.part.sidebar .monaco-list-row', { hasText: text }).first();
}

/** Expands an outline node; the outline remembers expanded nodes between runs. */
async function expandOutlineRow(page: Page, text: string): Promise<void> {
  const row = outlineRow(page, text);
  await row.waitFor();
  if ((await row.getAttribute('aria-expanded')) !== 'true') await row.locator('.monaco-tl-twistie').click();
}

/**
 * Renames the `{id}` path parameter of `/shows/{id}` in the tvmaze spec to
 * `{showId}`, which leaves the operation's `id` parameter unmatched. Typing
 * inside the braces avoids the editor's bracket auto-closing.
 */
async function breakPathParam(page: Page): Promise<void> {
  const editor = page.locator('.editor-group-container .monaco-editor').first();
  await editor.locator('.view-line', { hasText: '/shows/{id}:' }).click();
  await page.keyboard.press('End');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  await page.keyboard.type('showId');
  await page.keyboard.press('Escape');
  await editor.locator('.squiggly-error').first().waitFor({ timeout: 10000 });
}

test('openapi/outline.png', async () => {
  await withVsCode(
    'docs-openapi-outline',
    { workspaceFiles: [SPEC] },
    async (page) => {
      // The example spec has tags, operation IDs, and components, so every group has content
      await runCommand(page, 'Nouto: Open Example OpenAPI Specification');
      await page.locator('.quick-input-widget .monaco-list-row', { hasText: 'Swagger Petstore (OpenAPI 3.0)' }).click();
      await page.locator('.editor-group-container .monaco-editor .view-line').first().waitFor();
      await setSectionExpanded(page, 'API Testing', false);
      await setSectionExpanded(page, 'OpenAPI Outline', true);
      await expandOutlineRow(page, 'Paths');
      // The title bar buttons show while the pointer is over the view
      await sidebarSection(page, 'OpenAPI Outline').hover();
      await page.waitForTimeout(600);
      const rows = page.locator('.part.sidebar .monaco-list-row');
      await captureShot(page, [sidebarSection(page, 'OpenAPI Outline'), rows.last()], 'openapi/outline.png', {
        padding: 0,
        within: page.locator('.part.sidebar'),
      });
      // An untitled document; close it without the save prompt
      await runCommand(page, 'View: Revert and Close Editor');
      await setSectionExpanded(page, 'OpenAPI Outline', false);
      await setSectionExpanded(page, 'API Testing', true);
    },
    TALL_WINDOW
  );
});

test('openapi/preview.png', async () => {
  await withVsCode(
    'docs-openapi-preview',
    { workspaceFiles: [SPEC] },
    async (page) => {
      await quickOpen(page, SPEC);
      await page.locator('.editor-actions .action-label[aria-label^="Open OpenAPI Preview"]').first().click();
      const docs = await frameWith(page, '.swagger-ui .opblock');
      const preview = await frameWith(page, 'select[aria-label="Preview renderer"]');
      await expect(preview.locator('.banner', { hasText: 'Loading renderer' })).toHaveCount(0);
      // The preview opens beside the spec; give it the whole editor area
      await runCommand(page, 'View: Toggle Maximize Editor Group');
      await toggleSideBar(page);
      await settle(page);
      await captureShot(page, preview.locator('body'), 'openapi/preview.png', {
        padding: 0,
        until: docs.locator('.opblock').last(),
      });
      await toggleSideBar(page);
    },
    // The preview toolbar needs about 1000 px before its buttons wrap
    { width: 1080, height: 800, deviceScaleFactor: 2 }
  );
});

test('openapi/diagnostics.png', async () => {
  await withVsCode(
    'docs-openapi-diagnostics',
    { workspaceFiles: [SPEC] },
    async (page) => {
      // Structural checks always run; lint warnings would crowd the view
      await setOpenApiLinting(page, false);
      await quickOpen(page, SPEC);
      await breakPathParam(page);
      await runCommand(page, 'View: Toggle Problems');
      await page.locator('.markers-panel .monaco-list-row', { hasText: 'missing-path-param' }).first().waitFor();
      await settle(page);
      await captureShot(page, [page.locator('.part.editor'), page.locator('.part.panel')], 'openapi/diagnostics.png', {
        padding: 0,
        until: page.locator('.markers-panel .monaco-list-row').last(),
      });
      await runCommand(page, 'View: Toggle Problems');
      await runCommand(page, 'File: Revert File');
    },
    PANEL_WINDOW
  );
});

test('openapi/quick-fix.png', async () => {
  await withVsCode(
    'docs-openapi-quick-fix',
    { workspaceFiles: [SPEC] },
    async (page) => {
      await setOpenApiLinting(page, false);
      await quickOpen(page, SPEC);
      await breakPathParam(page);
      // The error underlines the operation; open the quick fixes there
      const editor = page.locator('.editor-group-container .monaco-editor').first();
      await editor.locator('.view-line', { hasText: /^\s*get:\s*$/ }).first().click();
      await page.keyboard.press('Control+.');
      const fixes = page.locator('.action-widget', { hasText: 'Add path parameter' }).last();
      await fixes.waitFor();
      await page.waitForTimeout(500);
      await captureShot(page, [page.locator('.part.editor .title').first(), fixes], 'openapi/quick-fix.png', {
        within: page.locator('.part.editor'),
      });
      await page.keyboard.press('Escape');
      await runCommand(page, 'File: Revert File');
    },
    PANEL_WINDOW
  );
});

/**
 * Landing page frames (ProductShowcase.astro) show a 16:9 image under their
 * own title bar, so these shots leave out VS Code's title bar: 1280x720 below it.
 */
const SHOWCASE_WINDOW: WindowSize = { width: 1280, height: 755, deviceScaleFactor: 2 };

async function captureShowcase(page: Page, file: string): Promise<void> {
  const titlebar = page.locator('.part.titlebar');
  const box = await titlebar.boundingBox();
  expect(SHOWCASE_WINDOW.height - (box!.y + box!.height), 'the shot should be 720 px tall').toBeCloseTo(720, -1);
  await captureWindow(page, file, { below: titlebar });
}

test('showcase/vscode.png', async () => {
  const api = 'https://jsonplaceholder.typicode.com';
  const jsonPlaceholder = collection('JSONPlaceholder', [
    folder('Users', [
      // A query parameter, so the request side shows its Query table. Saved
      // requests keep the query in `params`, and the URL bar appends it
      request({
        name: 'List users',
        method: 'GET',
        url: `${api}/users`,
        params: [{ id: 'param-media-limit', key: '_limit', value: '3', enabled: true, description: '' }],
      }),
      request({ name: 'Get user', method: 'GET', url: `${api}/users/1` }),
      request({ name: 'Create user', method: 'POST', url: `${api}/users` }),
    ]),
    folder('Posts', [
      request({ name: 'List posts', method: 'GET', url: `${api}/posts` }),
      request({ name: 'Get post', method: 'GET', url: `${api}/posts/1` }),
    ]),
  ]);
  await withVsCode(
    'showcase-vscode',
    { collections: [jsonPlaceholder], collapseSample: true },
    async (page, sidebar) => {
      const panel = await openSavedRequest(page, sidebar, 'List users');
      // Side by side: the request on the left, the JSON response on the right
      const layoutToggle = panel.locator('.layout-toggle-btn');
      if (!(await panel.locator('.panels.horizontal').count())) await layoutToggle.click();
      await sendAndWait(panel);
      await closeStuckTooltip(page, layoutToggle, panel.locator('.url-input'));
      await page.addStyleTag({ content: `.activitybar .badge { display: none !important; } ${HIDE_JSON_EXPLORER}` });
      await settle(page);
      await captureShowcase(page, 'showcase/vscode.png');
    },
    SHOWCASE_WINDOW
  );
});

test('showcase/json-explorer.png', async () => {
  await withVsCode(
    'showcase-json-explorer',
    { workspaceFiles: ['response.json'] },
    async (page) => {
      const explorer = await openInJsonExplorer(page, 'response.json');
      // The JSON Explorer side bar, with its Recent Files list
      await runCommand(page, 'View: Show JSON Explorer');
      await frameWith(page, '.recent-section');
      await explorer.locator('.tree-row[data-path="$[0]"]').click();
      await explorer.locator('.tree-row[data-path="$[0].address"]').click();
      await explorer.locator('.tree-row[data-path="$[0].address.geo"]').waitFor();
      // Nouto shares the server; this frame is about the standalone extension
      await page.addStyleTag({ content: `${activityBarEntry('nouto-sidebar')}, .statusbar-item[id*="nouto"] { display: none !important; }` });
      await settle(page);
      await captureShowcase(page, 'showcase/json-explorer.png');
    },
    SHOWCASE_WINDOW
  );
});
