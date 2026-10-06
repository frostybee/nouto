import { test, expect } from '@playwright/test';
import { click, foldMarkerFor, moveTo, pause, placeCursor, startRecording, typeText } from './recorder';

test('send-request: send a request and explore the response', async ({ page }) => {
  await page.goto('/tests/media/harness.html?scene=send-request&cursor=1');
  const urlInput = page.locator('.url-input');
  await expect(urlInput).toBeVisible();
  // Start the pointer near the method button, as if the user just arrived
  await placeCursor(page, 200, 220);

  const recording = await startRecording(page);
  await pause(page, 700);

  // Choose the method
  await click(page, page.locator('.method-select'));
  await pause(page, 350);
  await moveTo(page, page.locator('.method-option', { hasText: 'POST' }), 12);
  await pause(page, 250);
  await click(page, page.locator('.method-option', { hasText: /^\s*GET\s*$/ }), 12);
  await pause(page, 300);

  // Enter the URL and send
  await click(page, urlInput);
  await typeText(page, 'https://jsonplaceholder.typicode.com/users', 55);
  await pause(page, 350);
  await click(page, page.locator('.send-button-wrapper .send-button'));
  await expect(page.locator('.response-header .status')).toHaveText(/200\s+OK/);
  await pause(page, 1000);

  // Fold and unfold the first user's company. Folding also folds nested
  // objects and unfolding restores only one level, so pick a flat block.
  const companyMarker = await foldMarkerFor(page, '"company": {');
  await click(page, companyMarker);
  await pause(page, 1000);
  await click(page, companyMarker, 8);
  await pause(page, 700);

  // Raw, then back to Pretty
  await click(page, page.locator('button[aria-label="Raw"]'));
  await pause(page, 1200);
  await click(page, page.locator('button[aria-label="Pretty"]'));
  await pause(page, 600);

  await recording.stop('send-request', { holdMs: 1500 });
});
