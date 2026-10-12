// Drives the running Nouto desktop app through the gRPC flows against
// test-servers/grpc-test, over the WebView2 remote debugging port.
//
// See README.md in this folder for how to start the app and the server.
//
// Clicks are dispatched in the DOM and waits poll on a timer, because WebView2
// throttles animation frames and ignores synthetic mouse input while its window
// is not in the foreground.
import { mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { chromium } from '@playwright/test';

const CDP_PORT = process.env.NOUTO_CDP_PORT ?? '9333';
const GRPC_ADDRESS = process.env.NOUTO_GRPC_ADDRESS ?? 'localhost:50051';
const OUT = fileURLToPath(new URL('./output', import.meta.url));
mkdirSync(OUT, { recursive: true });

const results = [];
const record = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' :: ' + detail : ''}`);
};

const browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`);
const context = browser.contexts()[0];
const page = context.pages().find((p) => p.url().includes('localhost:5174')) ?? context.pages()[0];
page.setDefaultTimeout(20000);
await page.bringToFront().catch(() => {});

const POLL = { polling: 300 };
const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png` }).catch(() => {});
const domClick = (locator) => locator.evaluate((el) => el.click());
const visibleText = (selector) =>
  [...document.querySelectorAll(selector)].find((e) => e.offsetParent)?.textContent || '';

async function setBody(text) {
  const editor = page.locator('.grpc-panel:visible .cm-content').first();
  await editor.evaluate((el) => el.focus());
  await page.keyboard.press('Control+A');
  await page.keyboard.insertText(text);
}

async function pickMethod(name) {
  await domClick(page.locator('.method-trigger:visible'));
  await domClick(
    page.locator('.method-option:visible', { has: page.locator('.method-option-name', { hasText: new RegExp(`^${name}$`) }) })
  );
  await page.locator('.method-trigger:visible').waitFor();
}

const statusBadge = () => page.locator('.grpc-response:visible .status-bar .status-badge').first();
const mainButton = () => page.locator('.url-bar:visible .send-button').first();
const streamButton = (label) => page.locator('.url-bar:visible .send-button', { hasText: new RegExp(`^\\s*${label}\\s*$`) });

async function openResponseTab() {
  await domClick(page.locator('.grpc-response:visible .response-tabs .tab', { hasText: /^\s*Response\s*$/ }));
}
async function openTimeline() {
  await domClick(page.locator('.grpc-response:visible .response-tabs .tab', { hasText: 'Timeline' }));
}
const timelineLabels = () => page.locator('.grpc-response:visible .timeline-label').allTextContents();

async function expandRow(label) {
  const row = page.locator('.grpc-response:visible .timeline-row', { hasText: label }).first();
  // The expanded entry id persists across calls; only click when the row is collapsed
  const alreadyOpen = await row.evaluate((el) => el.closest('.timeline-entry')?.classList.contains('expanded'));
  if (!alreadyOpen) await domClick(row);
  const rows = page.locator('.grpc-response:visible .timeline-entry.expanded .metadata-row');
  await rows.first().waitFor();
  const keys = await rows.locator('.metadata-key').allTextContents();
  const values = await rows.locator('.metadata-value').allTextContents();
  return Object.fromEntries(keys.map((k, i) => [k.trim(), values[i]?.trim()]));
}

async function waitForBadge(re) {
  await page.waitForFunction(
    ([selector, src]) => new RegExp(src).test([...document.querySelectorAll(selector)].find((e) => e.offsetParent)?.textContent || ''),
    ['.grpc-response .status-bar .status-badge', re.source],
    { timeout: 30000, ...POLL }
  );
  return (await statusBadge().textContent())?.trim();
}

async function waitForMessageCount(n) {
  await page.waitForFunction(
    ([selector, count]) => new RegExp(`${count} messages`).test([...document.querySelectorAll(selector)].find((e) => e.offsetParent)?.textContent || ''),
    ['.grpc-response .msg-count', n],
    { timeout: 15000, ...POLL }
  );
}

async function responseText() {
  await openResponseTab();
  return page.locator('.grpc-response:visible .response-content .cm-content').first().textContent();
}

try {
  // 1. A new quick gRPC request. The New Request menu toggles, so open it only when needed
  const grpcItem = page.locator('.dropdown-item', { hasText: 'New gRPC Call' });
  if (!(await grpcItem.isVisible())) await domClick(page.locator('.new-request-arrow'));
  await domClick(grpcItem);
  await domClick(page.getByText('No Collection (Quick Request)').first());
  await page.locator('.grpc-panel:visible').waitFor();
  await page.keyboard.press('Escape');
  const url = page.locator('.url-input:visible').first();
  if ((await url.inputValue()) !== GRPC_ADDRESS) await url.fill(GRPC_ADDRESS, { force: true });

  // 2. Load the schema through reflection
  await domClick(page.locator('.onboarding-configure-btn:visible, .configure-btn:visible').first());
  await domClick(page.locator('.grpc-proto-selector:visible input[type="radio"]').first());
  await domClick(page.locator('.grpc-proto-selector:visible .load-btn'));
  await page.waitForFunction(
    () => [...document.querySelectorAll('.status-badge')].some((e) => e.offsetParent && /Schema Loaded|Error/.test(e.textContent || '')),
    null,
    { timeout: 30000, ...POLL }
  );
  const schemaError = await page.evaluate(() => [...document.querySelectorAll('.error-hint')].map((e) => e.textContent.trim()).join(' '));
  record('schema loaded over reflection', !schemaError, schemaError);
  await page.locator('.status-badge.loaded:visible').waitFor({ timeout: 5000 });

  // 3. Unary with a bytes field: real trailers, base64 bytes, default fields kept
  await pickMethod('Echo');
  await setBody('{"message": "hi", "blob": "aGVsbG8="}');
  await domClick(mainButton());
  let badge = await waitForBadge(/OK\s+0/);
  record('Echo ends OK 0', /OK\s+0/.test(badge), badge);
  const echo = await responseText();
  record('Echo response shows bytes as base64', echo.includes('aGVsbG8='), echo.slice(0, 160));
  record('Echo response keeps default fields', /"length"/.test(echo) && /"timestamp"/.test(echo));
  await openTimeline();
  const labels = await timelineLabels();
  record(
    'Echo timeline has metadata and trailers rows',
    labels.some((l) => /response metadata/i.test(l)) && labels.some((l) => /Received trailers/.test(l)),
    labels.join(' | ')
  );
  let trailers = await expandRow('Received trailers');
  record(
    'Echo trailers are the ones the server sent',
    trailers['x-grpc-test-call'] === 'unary' && trailers['x-grpc-test-server'] === 'grpc-test' && trailers['grpc-status'] === '0',
    JSON.stringify(trailers)
  );
  await shot('01-echo');

  // 4. Unary error: real status code and message
  await pickMethod('TriggerError');
  await setBody('{"code": 8, "message": "quota exceeded"}');
  await domClick(mainButton());
  badge = await waitForBadge(/RESOURCE_EXHAUSTED\s+8/);
  record('TriggerError ends with the real code', /RESOURCE_EXHAUSTED\s+8/.test(badge), badge);
  await openResponseTab();
  const errText = await page.locator('.grpc-response:visible .error-display').first().textContent().catch(() => '');
  record('TriggerError shows the server message', /quota exceeded/.test(errText), errText.trim().slice(0, 120));
  await shot('02-trigger-error');

  // 5. Server streaming: every message, then the real trailers
  await pickMethod('Countdown');
  await setBody('{"from": 3, "intervalMs": 150}');
  record('Countdown button says Stream', /Stream/.test(await mainButton().textContent()));
  await domClick(mainButton());
  badge = await waitForBadge(/OK\s+0/);
  record('Countdown ends OK 0', true, badge);
  await openTimeline();
  const received = (await timelineLabels()).filter((l) => /Received response$/.test(l.trim())).length;
  record('Countdown delivered 3 messages', received === 3, `${received} received rows`);
  trailers = await expandRow('Received trailers');
  record('Countdown trailers come from the server', trailers['x-grpc-test-call'] === 'server-streaming', JSON.stringify(trailers));
  await shot('03-countdown');

  // 6. Bidirectional: Send and Commit appear, Ctrl+Enter sends, Cancel reports CANCELLED 1
  await pickMethod('Chat');
  await setBody('{"text": "first"}');
  record('Chat button says Start Stream', /Start Stream/.test(await mainButton().textContent()));
  await domClick(mainButton());
  await streamButton('Send').waitFor({ timeout: 15000 });
  record('Chat shows Send and Commit while open', await streamButton('Commit').isVisible());
  await waitForMessageCount(1);
  await setBody('{"text": "second"}');
  await page.keyboard.press('Control+Enter');
  await waitForMessageCount(2);
  record('Ctrl+Enter sends a message on the open stream', true);
  await domClick(page.locator('.url-bar:visible .cancel-button').first());
  badge = await waitForBadge(/CANCELLED\s+1/);
  record('Cancelled Chat ends CANCELLED 1', /CANCELLED\s+1/.test(badge), badge);
  await openTimeline();
  trailers = await expandRow('Received trailers');
  record('Cancelled Chat trailers carry grpc-status 1', trailers['grpc-status'] === '1', JSON.stringify(trailers));
  await shot('04-chat-cancel');

  // 7. Bidirectional to completion: Commit ends the client side, server trailers arrive
  await setBody('{"text": "again"}');
  await domClick(mainButton());
  await streamButton('Commit').waitFor({ timeout: 15000 });
  await waitForMessageCount(1);
  await domClick(streamButton('Commit'));
  badge = await waitForBadge(/OK\s+0/);
  record('Committed Chat ends OK 0', true, badge);
  await openTimeline();
  trailers = await expandRow('Received trailers');
  record('Committed Chat trailers come from the server', trailers['x-grpc-test-call'] === 'bidi', JSON.stringify(trailers));
  await shot('05-chat-commit');

  // 8. Client streaming: one response after Commit, with trailers
  await pickMethod('Sum');
  await setBody('{"value": 2}');
  await domClick(mainButton());
  await streamButton('Send').waitFor({ timeout: 15000 });
  await setBody('{"value": 3}');
  await domClick(streamButton('Send'));
  await domClick(streamButton('Commit'));
  badge = await waitForBadge(/OK\s+0/);
  const sum = await responseText();
  record('Sum answers after Commit', /"total":\s*5/.test(sum) && /"count":\s*2/.test(sum), sum.slice(0, 120));
  await openTimeline();
  trailers = await expandRow('Received trailers');
  record('Sum trailers come from the server', trailers['x-grpc-test-call'] === 'client-stream', JSON.stringify(trailers));
  await shot('06-sum');
} catch (err) {
  record('script', false, String(err?.message || err).slice(0, 300));
  await shot('99-failure');
} finally {
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  await browser.close().catch(() => {});
  process.exit(failed.length ? 1 : 0);
}
