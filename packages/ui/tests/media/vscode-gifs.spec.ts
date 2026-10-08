/**
 * README GIFs recorded in real VS Code (`code serve-web`), following
 * my-docs/screenshots/reddit-gif-plan.md. Each test seeds Nouto's data, so
 * GIFs can be recorded alone: `pnpm -F @nouto/ui run media:vscode-gifs -g "#2"`.
 */
import { test, expect } from '@playwright/test';
import {
  choose,
  click,
  moveTo,
  dragTo,
  dragToPoint,
  foldMarkerFor,
  pasteText,
  pause,
  placeCursor,
  rightClick,
  startRecording,
  typeText,
} from './recorder';
import { collection, environment, request } from './state';
import {
  frameWith,
  openEmptyRequest,
  quickRequestItem,
  setOpenApiLinting,
  setSectionExpanded,
  stackPanels,
  withVsCode,
} from './vscodeWeb';

test.describe.configure({ mode: 'serial' });

test('#1 send a request and explore the response', async () => {
  await withVsCode('vscode-send-request-2x', {}, async (page, sidebar) => {
    // 1. Start with an empty request tab open
    const panel = await openEmptyRequest(page, sidebar);
    await stackPanels(page, panel);
    await placeCursor(page, 760, 360);

    const recording = await startRecording(page);
    await pause(page, 800);

    // 2. Click the method dropdown, select GET
    await click(page, panel.locator('.method-select'));
    await pause(page, 500);
    await click(page, panel.locator('.method-option', { hasText: /^\s*GET\s*$/ }), 14);
    await pause(page, 300);

    // 3. Paste the URL
    await click(page, panel.locator('.url-input'));
    await pause(page, 250);
    await pasteText(page, 'https://api.tvmaze.com/people');
    await pause(page, 700);

    // 4-5. Send, and wait for 200 OK with the response time
    await click(page, panel.locator('.send-button-wrapper .send-button'));
    await expect(panel.locator('.response-header .status')).toHaveText(/200\s+OK/, { timeout: 30000 });
    await pause(page, 1200);

    // 6-7. Fold a JSON object, then expand it. `country` has no nested
    // objects, so expanding restores everything (see gifs.spec.ts).
    const countryMarker = await foldMarkerFor(panel, '"country": {');
    await click(page, countryMarker);
    await pause(page, 1000);
    await click(page, countryMarker, 8);
    await pause(page, 800);

    // 8-9. Raw, then back to Pretty
    await click(page, panel.locator('button[aria-label="Raw"]'));
    await pause(page, 1300);
    await click(page, panel.locator('button[aria-label="Pretty"]'));
    await pause(page, 800);

    // 10-12. The response's Headers, Timing, and Timeline tabs. The request
    // panel has its own Headers tab, so stay inside the response panel.
    const responseTab = (label: string) =>
      panel.locator('.response-panel .panel-tab', { hasText: new RegExp(`^\\s*${label}\\b`) }).first();
    await click(page, responseTab('Headers'));
    await pause(page, 1500);
    await click(page, responseTab('Timing'));
    await pause(page, 1700);
    await click(page, responseTab('Timeline'));
    await pause(page, 1500);

    await recording.stop('vscode-send-request-2x', { holdMs: 1500 });
  });
});

test('#2 collections with drag-and-drop', async () => {
  const api = 'https://jsonplaceholder.typicode.com';
  const seeded = collection('JSONPlaceholder API', [
    request({ name: 'List users', method: 'GET', url: `${api}/users` }),
    request({ name: 'Get user', method: 'GET', url: `${api}/users/1` }),
    request({ name: 'List posts', method: 'GET', url: `${api}/posts` }),
    request({ name: 'Create post', method: 'POST', url: `${api}/posts` }),
    request({ name: 'List todos', method: 'GET', url: `${api}/todos` }),
  ]);

  await withVsCode('vscode-collections', { collections: [seeded], collapseSample: true }, async (page, sidebar) => {
    const collectionHeader = sidebar.locator('.collection-header', { hasText: 'JSONPlaceholder API' });
    const requestItem = (name: string) => sidebar.locator('.request-item', { hasText: name }).first();
    const folderHeader = (name: string) => sidebar.locator('.folder-header', { hasText: name }).first();
    const newFolder = async (name: string) => {
      await pause(page, 450);
      await click(page, sidebar.locator('.context-item', { hasText: 'New Folder' }), 14);
      await pause(page, 500);
      await typeText(page, name, 90);
      await pause(page, 350);
      await page.keyboard.press('Enter');
    };

    await placeCursor(page, 760, 360);
    const recording = await startRecording(page);
    await pause(page, 800);

    // 2. Right-click the collection, choose New Folder, name it "Users"
    await rightClick(page, collectionHeader);
    await newFolder('Users');
    await expect(folderHeader('Users')).toBeVisible();
    await pause(page, 800);

    // 3-4. Drag two requests into the folder; it shows them nested
    await dragTo(page, requestItem('List users'), folderHeader('Users'));
    await pause(page, 800);
    await dragTo(page, requestItem('Get user'), folderHeader('Users'));
    await pause(page, 1000);

    // 5. Drag one request above the other to reorder
    await dragTo(page, requestItem('Get user'), requestItem('List users'), { yFraction: 0.2 });
    await pause(page, 1000);

    // 6. A sub-folder inside "Users" shows deep nesting
    await rightClick(page, folderHeader('Users'));
    await newFolder('Admin');
    await expect(folderHeader('Admin')).toBeVisible();
    await pause(page, 1200);

    await recording.stop('vscode-collections', { holdMs: 1500 });
  });
});

test('#3 environment switching', async () => {
  const local = environment('Local', { baseUrl: 'http://localhost:3000' }, '#4CAF50');
  const production = environment('Production', { baseUrl: 'https://api.tvmaze.com' }, '#F44336');
  const seeded = collection('TVmaze API', [request({ name: 'List people', method: 'GET', url: '{{baseUrl}}/people' })]);

  await withVsCode(
    'vscode-environments',
    { collections: [seeded], collapseSample: true, environments: { environments: [local, production], activeId: local.id } },
    async (page, sidebar) => {
      // 1-2. Open the request that uses {{baseUrl}}
      await sidebar.locator('.request-item', { hasText: 'List people' }).click();
      const panel = await frameWith(page, '.url-input');
      await stackPanels(page, panel);
      const statusBarEnv = (name: string) => page.locator('.statusbar-item', { hasText: name }).first();
      await expect(statusBarEnv('Local')).toBeVisible();
      await placeCursor(page, 760, 360);

      const recording = await startRecording(page);
      await pause(page, 1000);

      // 3. With Local active, the request goes to localhost:3000, where nothing runs
      await moveTo(page, statusBarEnv('Local'));
      await pause(page, 600);
      await click(page, panel.locator('.send-button-wrapper .send-button'));
      await expect(panel.locator('.response-header .status')).not.toHaveText(/Sending|Ready/, { timeout: 30000 });
      await pause(page, 1800);

      // 4-5. Switch to Production from the status bar
      await click(page, statusBarEnv('Local'));
      await pause(page, 700);
      await click(page, page.locator('.quick-input-widget .monaco-list-row', { hasText: 'Production' }), 18);
      await expect(statusBarEnv('Production')).toBeVisible();
      await pause(page, 900);

      // 6-7. Send again: the same request now reaches the production API
      await click(page, panel.locator('.send-button-wrapper .send-button'));
      await expect(panel.locator('.response-header .status')).toHaveText(/200\s+OK/, { timeout: 30000 });
      await pause(page, 1200);
      await click(page, panel.locator('.response-panel .panel-tab', { hasText: /^\s*Headers\b/ }).first());
      await pause(page, 2000);

      await recording.stop('vscode-environments', { holdMs: 1500 });
    }
  );
});

test('#4 code generation', async () => {
  await withVsCode('vscode-codegen', {}, async (page, sidebar) => {
    // 1. Start with a completed request: URL filled, 200 OK visible
    const panel = await openEmptyRequest(page, sidebar);
    await stackPanels(page, panel);
    await panel.locator('.url-input').fill('https://api.tvmaze.com/shows/1');
    await panel.locator('.send-button-wrapper .send-button').click();
    await expect(panel.locator('.response-header .status')).toHaveText(/200\s+OK/, { timeout: 30000 });
    // The dialog remembers the last language, so pick cURL off camera
    await panel.locator('button.secondary-btn', { hasText: 'Code' }).click();
    await panel.locator('.codegen-panel .lang-btn', { hasText: /^\s*cURL\s*$/ }).click();
    await page.keyboard.press('Escape');
    await expect(panel.locator('.codegen-panel')).toHaveCount(0);
    await placeCursor(page, 760, 400);

    const recording = await startRecording(page);
    await pause(page, 900);

    // 2-3. The Code button next to Send opens the panel with cURL selected
    await click(page, panel.locator('button.secondary-btn', { hasText: 'Code' }));
    await pause(page, 1600);

    // 4-6. Python, JavaScript, and C#
    const language = (label: string) => panel.locator('.lang-btn', { hasText: label }).first();
    for (const label of ['Python - Requests', 'JavaScript - Fetch', 'C# - HttpClient']) {
      await click(page, language(label), 16);
      await pause(page, 1700);
    }

    // 7. Close the panel
    await click(page, panel.locator('.codegen-panel .close-btn'));
    await pause(page, 900);

    await recording.stop('vscode-codegen', { holdMs: 1200 });
  });
});

test('#5 import from Postman', async () => {
  await withVsCode(
    'vscode-postman-import',
    { collapseSample: true, workspaceFiles: ['tvmaze.postman_collection.json'] },
    async (page, sidebar) => {
      await placeCursor(page, 760, 360);
      const recording = await startRecording(page);
      await pause(page, 800);

      // 2. Import / Export > Import Collection. Nouto detects the format, so
      // there is no "choose Postman" step.
      await click(page, sidebar.locator('.toolbar-button[aria-label="Import / Export"]'));
      await pause(page, 500);
      await click(page, sidebar.locator('.import-item', { hasText: 'Import Collection' }), 14);

      // 4. Pick the Postman export in VS Code's file dialog
      const fileRow = page.locator('.quick-input-widget .monaco-list-row', { hasText: 'tvmaze.postman_collection.json' });
      await fileRow.waitFor();
      await pause(page, 800);
      await click(page, fileRow, 18);
      await pause(page, 300);
      if (await page.locator('.quick-input-widget').isVisible()) await page.keyboard.press('Enter');

      // 5. The collection appears with its folders and requests
      const imported = sidebar.locator('.collection-header', { hasText: 'TVmaze API' });
      await expect(imported).toBeVisible({ timeout: 15000 });
      await pause(page, 1500);

      // 6-7. Open an imported request, stack the panels, and send it
      await click(page, sidebar.locator('.request-item', { hasText: 'Get show' }).first());
      const panel = await frameWith(page, '.url-input');
      await expect(panel.locator('.url-input')).toHaveValue(/shows\/1/);
      await pause(page, 800);
      // Nouto remembers the layout; stack it only if this tab opened side by side
      if (await panel.locator('.panels.horizontal').count()) {
        await click(page, panel.locator('.layout-toggle-btn'));
        await pause(page, 600);
      }
      await click(page, panel.locator('.send-button-wrapper .send-button'));
      await expect(panel.locator('.response-header .status')).toHaveText(/200\s+OK/, { timeout: 30000 });
      await pause(page, 2000);

      await recording.stop('vscode-postman-import', { holdMs: 1500 });
    }
  );
});

test('#6 GraphQL with schema fetch', async () => {
  await withVsCode('vscode-graphql', { collapseSample: true }, async (page, sidebar) => {
    await placeCursor(page, 760, 360);
    const recording = await startRecording(page);
    await pause(page, 800);

    // 1-2. New GraphQL Request from the New Request menu (it uses POST)
    await click(page, sidebar.locator('.new-request-arrow'));
    await pause(page, 500);
    await click(page, sidebar.locator('.dropdown-item', { hasText: 'New GraphQL Request' }), 14);
    // Nouto asks where to save the request first
    const quickRequest = quickRequestItem(page);
    await quickRequest.waitFor();
    await pause(page, 500);
    await click(page, quickRequest, 16);
    const panel = await frameWith(page, 'button:has-text("Fetch Schema")');
    await expect(panel.locator('.url-input')).toBeVisible();
    await pause(page, 600);
    // Side by side gives the query editor the full height; a GraphQL
    // response is small enough for the narrower column
    if (!(await panel.locator('.panels.horizontal').count())) {
      await click(page, panel.locator('.layout-toggle-btn'));
      await pause(page, 500);
    }
    // The response is small, so give the request side two thirds of the width
    await panel.locator('.panels.horizontal .splitter.horizontal').first().waitFor();
    const panels = await panel.locator('.panels').boundingBox();
    await dragToPoint(page, panel.locator('.panels .splitter').first(), {
      x: panels!.x + panels!.width * 0.66,
      y: panels!.y + panels!.height * 0.45,
    }, 20);
    await pause(page, 500);

    // 3. The endpoint
    await click(page, panel.locator('.url-input'));
    await pause(page, 250);
    await pasteText(page, 'https://countries.trevorblades.com/');
    await pause(page, 600);

    // 4. Fetch the schema
    await click(page, panel.locator('button', { hasText: 'Fetch Schema' }));
    await pause(page, 1800);

    // 5-6. Type a query; completions come from the fetched schema
    const editor = panel.locator('.cm-query-container .cm-content');
    await click(page, editor);
    // Three lines keep the query inside its box: closeBrackets adds the "} }"
    await typeText(page, '{ country(code: "CA") {', 75);
    await page.keyboard.press('Enter');
    const fields = ['nam', 'cap', 'emo'];
    for (const [i, prefix] of fields.entries()) {
      await typeText(page, prefix, 110);
      await panel.locator('.cm-tooltip-autocomplete').waitFor({ timeout: 5000 });
      await pause(page, 600);
      await page.keyboard.press('Enter');
      await pause(page, 250);
      if (i < fields.length - 1) await typeText(page, ' ', 60);
    }
    await pause(page, 900);

    // 7. Send and show the GraphQL response
    await click(page, panel.locator('.send-button-wrapper .send-button'));
    await expect(panel.locator('.response-header .status')).toHaveText(/200\s+OK/, { timeout: 30000 });
    await pause(page, 2200);

    await recording.stop('vscode-graphql', { holdMs: 1500 });
  });
});

test('#7 WebSocket session', async () => {
  await withVsCode('vscode-websocket', { collapseSample: true }, async (page, sidebar) => {
    await placeCursor(page, 760, 360);
    const recording = await startRecording(page);
    await pause(page, 800);

    // 1. New WebSocket from the New Request menu
    await click(page, sidebar.locator('.new-request-arrow'));
    await pause(page, 500);
    await click(page, sidebar.locator('.dropdown-item', { hasText: 'New WebSocket' }), 14);
    const quickRequest = quickRequestItem(page);
    await quickRequest.waitFor();
    await pause(page, 500);
    await click(page, quickRequest, 16);
    const panel = await frameWith(page, '.ws-panel');
    await pause(page, 700);

    // 2-3. Echo server URL, then Connect
    await click(page, panel.locator('.url-input'));
    await pause(page, 250);
    await pasteText(page, 'wss://echo.websocket.org');
    await pause(page, 600);
    await click(page, panel.locator('.send-button', { hasText: 'Connect' }).first());
    await expect(panel.locator('.status-text')).toHaveText(/connected/i, { timeout: 20000 });
    await pause(page, 1200);

    // 4-6. Send two messages; each comes back from the echo server
    const messages = ['Hello from Nouto!', '{"event": "ping", "id": 2}'];
    for (const message of messages) {
      await click(page, panel.locator('.message-input'));
      await typeText(page, message, 55);
      await pause(page, 300);
      await click(page, panel.locator('.send-btn'), 14);
      await expect(panel.getByText(message, { exact: false })).toHaveCount(2, { timeout: 10000 });
      await pause(page, 1300);
    }

    // 7. Disconnect
    await click(page, panel.locator('.disconnect-btn'));
    await expect(panel.locator('.status-text')).toHaveText(/disconnected/i, { timeout: 10000 });
    await pause(page, 1200);

    await recording.stop('vscode-websocket', { holdMs: 1500 });
  });
});

test('#8 assertions', async () => {
  await withVsCode('vscode-assertions', {}, async (page, sidebar) => {
    // 1. Start with a GET request already set up
    const panel = await openEmptyRequest(page, sidebar);
    await stackPanels(page, panel, 0.5);
    await panel.locator('.url-input').fill('https://api.tvmaze.com/shows/1');
    await placeCursor(page, 760, 360);

    const recording = await startRecording(page);
    await pause(page, 800);

    // 2. The request's Tests tab
    await click(page, panel.locator('.request-panel .panel-tab', { hasText: /^\s*Tests/ }).first());
    await pause(page, 600);

    // 3-4. Add Test: a new test already reads Status Code = 200
    const rows = panel.locator('.assertion-container');
    await click(page, panel.locator('.add-btn', { hasText: 'Add Test' }));
    await expect(rows.nth(0).locator('.expected-input')).toHaveValue('200');
    await pause(page, 1100);

    // 5. Add Test: Response Time < 2000 ms
    await click(page, panel.locator('.add-btn', { hasText: 'Add Test' }));
    await choose(page, rows.nth(1).locator('.target-select'), 'responseTime');
    await pause(page, 250);
    await choose(page, rows.nth(1).locator('.operator-select'), 'lessThan', 10);
    await click(page, rows.nth(1).locator('.expected-input'), 10);
    // Clear the default before typing; select-all then typing drops a key here
    await rows.nth(1).locator('.expected-input').fill('');
    await pause(page, 200);
    await typeText(page, '2000', 120);
    await expect(rows.nth(1).locator('.expected-input')).toHaveValue('2000');
    await pause(page, 600);

    // 6. Send
    await click(page, panel.locator('.send-button-wrapper .send-button'));
    await expect(panel.locator('.response-header .status')).toHaveText(/200\s+OK/, { timeout: 30000 });
    await pause(page, 1200);

    // 7. The response's Tests tab shows both passing
    await click(page, panel.locator('.response-panel .panel-tab', { hasText: /^\s*Tests/ }).first());
    await pause(page, 2200);

    await recording.stop('vscode-assertions', { holdMs: 1500 });
  });
});

test('#9 OpenAPI editor', async () => {
  const spec = 'tvmaze.openapi.yaml';
  await withVsCode('vscode-openapi', { workspaceFiles: [spec] }, async (page) => {
    // Lint squiggles would cover the demo; the setting persists in the browser profile
    await setOpenApiLinting(page, false);

    // The outline gets the side bar to itself
    await setSectionExpanded(page, 'API Testing', false);
    await setSectionExpanded(page, 'OpenAPI Outline', true);
    await placeCursor(page, 760, 360);

    const recording = await startRecording(page);
    await pause(page, 800);

    // 1. Open the spec with Quick Open; the outline fills in
    await page.keyboard.press('Control+P');
    await page.locator('.quick-input-widget input').waitFor();
    await typeText(page, 'tvmaze.open', 90);
    await page.locator('.quick-input-widget .monaco-list-row', { hasText: spec }).first().waitFor();
    await pause(page, 500);
    await page.keyboard.press('Enter');
    const editor = page.locator('.editor-group-container .monaco-editor').first();
    const lastLine = editor.locator('.view-line', { hasText: 'description: A page of people' });
    await lastLine.waitFor();
    const outlineRow = (text: string) => page.locator('.part.sidebar .monaco-list-row', { hasText: text }).first();
    await outlineRow('Paths').waitFor();
    await pause(page, 800);
    // The outline remembers expanded nodes between runs
    if ((await outlineRow('Paths').getAttribute('aria-expanded')) !== 'true') {
      await click(page, outlineRow('Paths').locator('.monaco-tl-twistie'));
    }
    await outlineRow('/people').waitFor();
    await pause(page, 1200);

    // 2. A new path at the end of `paths`
    await click(page, lastLine);
    await page.keyboard.press('ArrowDown');
    await pause(page, 300);
    await typeText(page, '  /schedule:', 80);
    await page.keyboard.press('Escape');
    // The demo workspace keeps YAML indentation on Enter, so indent one level by hand
    await page.keyboard.press('Enter');
    await page.keyboard.press('Tab');

    // 3-4. Completions for the operation, its summary, and its responses
    const suggest = editor.locator('.suggest-widget.visible');
    const accept = async (prefix: string, label: string) => {
      await typeText(page, prefix, 120);
      await suggest.locator('.monaco-list-row.focused', { hasText: label }).waitFor({ timeout: 8000 });
      await pause(page, 700);
      await page.keyboard.press('Enter');
      await pause(page, 300);
    };
    await accept('ge', 'get');
    await accept('summ', 'summary');
    await typeText(page, "Today's schedule", 70);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Enter');
    await accept('resp', 'responses');
    // The snippet selects the status code, then the description
    await pause(page, 500);
    await page.keyboard.press('Tab');
    await typeText(page, 'Episodes airing today', 70);
    await page.keyboard.press('Escape');
    await pause(page, 600);

    // 5. The outline picks up the new path
    await outlineRow('/schedule').waitFor();
    await moveTo(page, outlineRow('/schedule'));
    await pause(page, 1200);

    // 6. Open the preview from the editor title bar
    const preview = page.locator('.editor-actions .action-label[aria-label^="Open OpenAPI Preview"]').first();
    await moveTo(page, preview);
    await pause(page, 1200);
    await click(page, preview, 8);
    await pause(page, 4000);

    // 7. Expand the new operation in the rendered docs, then scroll through it
    const docs = await frameWith(page, '.swagger-ui .opblock');
    await click(page, docs.locator('.opblock-summary', { hasText: '/schedule' }).first());
    await docs.locator('.opblock.is-open').first().waitFor();
    await pause(page, 1200);
    for (let i = 0; i < 5; i++) {
      await page.mouse.wheel(0, 100);
      await pause(page, 140);
    }
    await pause(page, 2200);

    await recording.stop('vscode-openapi', { holdMs: 1500 });
    // Save, so the next window doesn't restore a dirty editor
    await editor.locator('.view-lines').click();
    await page.keyboard.press('Control+S');
    await expect(page.locator('.tab.dirty')).toHaveCount(0);
  });
});

test('#10 response timing breakdown', async () => {
  await withVsCode('vscode-timing', {}, async (page, sidebar) => {
    // 1. Start with a GET request to a remote API
    const panel = await openEmptyRequest(page, sidebar);
    await stackPanels(page, panel);
    await panel.locator('.url-input').fill('https://api.tvmaze.com/people');
    await placeCursor(page, 760, 360);

    const recording = await startRecording(page);
    await pause(page, 800);

    // 2. Send, wait for the response
    await click(page, panel.locator('.send-button-wrapper .send-button'));
    await expect(panel.locator('.response-header .status')).toHaveText(/200\s+OK/, { timeout: 30000 });
    await pause(page, 1200);

    // 3. The response's Timing tab
    await click(page, panel.locator('.response-panel .panel-tab', { hasText: /^\s*Timing\b/ }).first());
    await panel.locator('.waterfall-row').first().waitFor();
    await pause(page, 1000);

    // 4. Walk down the waterfall: DNS, TCP, TLS, waiting, download
    const rows = panel.locator('.waterfall-row');
    for (let i = 0; i < (await rows.count()); i++) {
      await moveTo(page, rows.nth(i).locator('.wf-bar'), 12);
      await pause(page, 550);
    }
    await moveTo(page, panel.locator('.response-time-header'), 16);
    await pause(page, 1200);

    await recording.stop('vscode-timing', { holdMs: 1500 });
  });
});

test('#11 declaring and using variables', async () => {
  // An active environment with no variables yet: the GIF declares them. The
  // Environments panel's own "Set active" doesn't reach requests, so seed it
  const tvmaze = environment('TVmaze', {}, '#2196F3');

  await withVsCode(
    'vscode-variables',
    { collapseSample: true, environments: { environments: [tvmaze], activeId: tvmaze.id } },
    async (page, sidebar) => {
      await placeCursor(page, 760, 360);
      const recording = await startRecording(page);
      await pause(page, 600);

      // 1. Open the Environments panel from the status bar picker
      await click(page, page.locator('.statusbar-item', { hasText: 'TVmaze' }).first(), 20);
      const manage = page.locator('.quick-input-widget .monaco-list-row', { hasText: 'Manage Environments' });
      await manage.waitFor();
      await pause(page, 400);
      await click(page, manage, 14);
      const envPanel = await frameWith(page, '.env-item');
      const tvmazeItem = envPanel.locator('.env-item', { hasText: 'TVmaze' }).first();
      if (!(await tvmazeItem.evaluate((el) => el.classList.contains('selected')))) await click(page, tvmazeItem, 16);
      await pause(page, 400);

      // 2. Declare baseUrl and showId, then save
      await click(page, envPanel.locator('.add-btn', { hasText: 'Add Item' }), 14);
      const rows = envPanel.locator('.kv-row');
      await click(page, rows.nth(0).locator('input.key-input'), 10);
      await typeText(page, 'baseUrl', 80);
      await click(page, rows.nth(0).locator('.col-value input[placeholder="Value"]'), 10);
      await pasteText(page, 'https://api.tvmaze.com');
      await pause(page, 400);
      // Enter in the last row adds a row and focuses its name
      await page.keyboard.press('Enter');
      await rows.nth(1).waitFor();
      await typeText(page, 'showId', 80);
      await click(page, rows.nth(1).locator('.col-value input[placeholder="Value"]'), 10);
      await typeText(page, '1', 80);
      await pause(page, 300);
      const save = envPanel.locator('button.save-btn');
      await click(page, save, 14);
      await expect(save).toBeDisabled();
      await pause(page, 600);

      // 3. A new request
      await click(page, sidebar.locator('.new-request-button'), 18);
      const quickRequest = quickRequestItem(page);
      await quickRequest.waitFor();
      await pause(page, 300);
      await click(page, quickRequest, 12);
      const panel = await frameWith(page, '.url-input');
      await expect(panel.locator('.url-input')).toBeVisible();
      await pause(page, 300);
      if (await panel.locator('.panels.horizontal').count()) {
        await click(page, panel.locator('.layout-toggle-btn'), 14);
        await pause(page, 400);
      }

      // 4. {{ lists the environment's variables with their values
      const urlInput = panel.locator('.url-input');
      await click(page, urlInput, 14);
      await typeText(page, '{{', 120);
      await panel.locator('.url-var-item.selected', { hasText: 'baseUrl' }).waitFor();
      await pause(page, 900);
      await page.keyboard.press('Enter');
      await typeText(page, '/shows/', 70);
      await typeText(page, '{{sh', 100);
      await panel.locator('.url-var-item.selected', { hasText: 'showId' }).waitFor();
      await pause(page, 600);
      await page.keyboard.press('Enter');
      await expect(urlInput).toHaveValue('{{baseUrl}}/shows/{{showId}}');
      await pause(page, 300);

      // 5. The indicator turns green; its tooltip names the resolved variables
      await moveTo(page, panel.locator('.url-input-wrapper .variable-indicator'), 12);
      await expect(
        panel.locator('.url-input-wrapper .tooltip-wrapper:has(.variable-indicator) .tooltip.ready')
      ).toContainText('Resolved: baseUrl, showId');
      await pause(page, 1300);

      // 6. A header with a dynamic variable. New requests start with a
      // User-Agent header, so the editor shows "Add" below the rows
      await click(page, panel.locator('section.request-panel .panel-tab', { hasText: /^\s*Headers/ }).first(), 16);
      await pause(page, 300);
      const addHeader = panel.locator('section.request-panel .add-row-btn, section.request-panel .add-btn:has-text("Add Item")').first();
      await click(page, addHeader, 12);
      const headerRow = panel.locator('section.request-panel .kv-row').last();
      const headerName = headerRow.locator('input[placeholder="Header"]');
      await click(page, headerName, 10);
      await typeText(page, 'X-Req', 100);
      await panel.locator('.autocomplete-dropdown .suggestion-item', { hasText: 'X-Request-ID' }).first().waitFor();
      await pause(page, 400);
      await page.keyboard.press('ArrowDown');
      await pause(page, 200);
      await page.keyboard.press('Enter');
      await expect(headerName).toHaveValue('X-Request-ID');
      const headerValue = headerRow.locator('.col-value input[placeholder="Value"]');
      await click(page, headerValue, 10);
      await typeText(page, '{{$uuid', 100);
      await panel.locator('.var-dropdown .var-item.selected', { hasText: '$uuid.v4' }).waitFor();
      await pause(page, 800);
      await page.keyboard.press('Enter');
      await expect(headerValue).toHaveValue('{{$uuid.v4}}');
      await moveTo(page, headerRow.locator('.col-indicator .variable-indicator'), 12);
      await pause(page, 1100);

      // 7. Send; the request headers show the UUID that was generated
      await click(page, panel.locator('.send-button-wrapper .send-button'), 16);
      await expect(panel.locator('.response-header .status')).toHaveText(/200\s+OK/, { timeout: 30000 });
      await pause(page, 700);
      await click(page, panel.locator('.response-panel .panel-tab', { hasText: /^\s*Headers\b/ }).first(), 14);
      const requestHeaders = panel.locator('.response-panel .section-header', { hasText: 'Request Headers' }).first();
      await requestHeaders.waitFor();
      await pause(page, 300);
      await requestHeaders.evaluate((el) => el.scrollIntoView({ block: 'start', behavior: 'smooth' }));
      await pause(page, 700);
      await moveTo(page, panel.locator('tr.header-row', { hasText: 'X-Request-ID' }).first().locator('td.header-value'), 12);
      await pause(page, 1800);

      await recording.stop('vscode-variables', { holdMs: 1500 });
    }
  );
});
