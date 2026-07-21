import { test, expect, type Page, type Request } from '@playwright/test';
import { MALICIOUS_SPEC, BENIGN_SPEC } from './malicious-spec';

const FIXTURE = '/tests/security/fixture.html';

/** Requests to anything that is not the local dev server are forbidden. */
function isExternal(request: Request): boolean {
  const url = request.url();
  if (url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('about:')) return false;
  return !url.startsWith('http://localhost:') && !url.startsWith('http://127.0.0.1:');
}

/**
 * Chromium reports a `request` event even for attempts the CSP refuses, so an
 * attempt alone proves nothing. A route handler, by contrast, only runs once a
 * request reaches the network layer — i.e. once it has passed the CSP. The
 * handler fulfills successfully so that a genuine escape is observable rather
 * than being masked by DNS failure.
 */
async function openFixture(page: Page) {
  const escaped: string[] = [];
  const attempted: string[] = [];
  page.on('request', (request) => { attempted.push(request.url()); });
  await page.route('**/*', (route) => {
    const request = route.request();
    if (isExternal(request)) {
      escaped.push(request.url());
      return route.fulfill({ status: 200, contentType: 'text/plain', body: '' });
    }
    return route.continue();
  });
  await page.goto(FIXTURE);
  await page.waitForFunction(() => window.__posted.length > 0);
  return { escaped, attempted };
}

async function sendSpec(page: Page, spec: unknown, version = '3.1', stale = false) {
  await page.evaluate(
    ([spec, version, stale]) => {
      window.__sendPreviewData({
        documentUri: 'file:///fixture.yaml',
        documentVersion: 1,
        spec,
        version,
        stale,
      });
    },
    [spec, version, stale] as const
  );
}

async function waitForRender(page: Page) {
  await expect(page.locator('iframe')).toHaveCount(1);
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('#mount')).not.toBeEmpty({ timeout: 20000 });
}

test.describe('OpenAPI preview sandbox', () => {
  test('renders a hostile specification without granting parent access', async ({ page }) => {
    await openFixture(page);
    await sendSpec(page, MALICIOUS_SPEC);
    await waitForRender(page);

    expect(await page.evaluate(() => window.__parentBreached)).toBe(false);
    // The injected markup must not have produced a real script element.
    const scriptCount = await page
      .frameLocator('iframe')
      .locator('#mount script')
      .count();
    expect(scriptCount).toBe(0);
  });

  test('makes no external network request for a hostile specification', async ({ page }) => {
    const { escaped, attempted } = await openFixture(page);
    await sendSpec(page, MALICIOUS_SPEC);
    await waitForRender(page);
    await page.waitForTimeout(1500);

    expect(escaped).toEqual([]);
    // The hostile markup did try to reach out; the CSP is what stopped it.
    expect(attempted.some((url) => url.includes('evil.test'))).toBe(true);
  });

  test('does not navigate when hostile links are clicked', async ({ page }) => {
    await openFixture(page);
    await sendSpec(page, MALICIOUS_SPEC);
    await waitForRender(page);

    const before = page.url();
    const links = page.frameLocator('iframe').locator('#mount a');
    if (await links.count()) {
      await links.first().click({ force: true, noWaitAfter: true }).catch(() => {});
    }
    await page.waitForTimeout(500);

    expect(page.url()).toBe(before);
    expect(await page.evaluate(() => window.__parentBreached)).toBe(false);
  });

  test('does not submit hostile forms', async ({ page }) => {
    const { escaped } = await openFixture(page);
    await sendSpec(page, MALICIOUS_SPEC);
    await waitForRender(page);

    await page.frameLocator('iframe').locator('#mount form').evaluateAll((forms) => {
      for (const form of forms) (form as HTMLFormElement).submit?.();
    }).catch(() => {});
    await page.waitForTimeout(500);

    expect(escaped).toEqual([]);
  });

  test('loads only the active renderer chunk', async ({ page }) => {
    const { attempted } = await openFixture(page);
    await sendSpec(page, BENIGN_SPEC);
    await waitForRender(page);

    const requested = attempted.join('\n');
    expect(requested).toMatch(/swagger-ui/);
    // ReDoc is not the active renderer, so its bundle must never be fetched.
    expect(requested).not.toMatch(/redoc/i);
  });

  test('reuses the same iframe across document updates', async ({ page }) => {
    await openFixture(page);
    await sendSpec(page, BENIGN_SPEC);
    await waitForRender(page);

    await page.evaluate(() => {
      document.querySelector('iframe')!.setAttribute('data-marker', 'original');
    });
    const srcBefore = await page.getAttribute('iframe', 'src');

    const edited = { ...BENIGN_SPEC, info: { ...BENIGN_SPEC.info, title: 'Edited API' } };
    await sendSpec(page, edited);
    await expect(page.frameLocator('iframe').locator('#mount')).toContainText('Edited API');

    await expect(page.locator('iframe')).toHaveCount(1);
    expect(await page.getAttribute('iframe', 'data-marker')).toBe('original');
    // An unchanged src proves the renderer document was not rebuilt and the
    // bundle was not reloaded — the edit rerendered inside the live frame.
    expect(await page.getAttribute('iframe', 'src')).toBe(srcBefore);
  });

  test('replaces the iframe when the renderer changes and loads ReDoc lazily', async ({ page }) => {
    const { attempted, escaped } = await openFixture(page);
    await sendSpec(page, BENIGN_SPEC);
    await waitForRender(page);

    await page.evaluate(() => {
      document.querySelector('iframe')!.setAttribute('data-marker', 'original');
    });

    await page.selectOption('select >> nth=0', 'redoc');
    await waitForRender(page);
    await page.waitForTimeout(1500);

    expect(attempted.join('\n')).toMatch(/redoc/i);
    // ReDoc reaches for a remote logo; the CSP must stop it from loading.
    expect(escaped).toEqual([]);
    expect(attempted.some((url) => url.includes('cdn.redoc.ly'))).toBe(true);
  });

  test('persists renderer and theme selections', async ({ page }) => {
    await openFixture(page);
    await sendSpec(page, BENIGN_SPEC);
    await waitForRender(page);

    await page.selectOption('select >> nth=1', 'dark');

    const state = await page.evaluate(() => window.__state as Record<string, unknown>);
    expect(state.theme).toBe('dark');
    expect(state.sourceUri).toBe('file:///fixture.yaml');
  });

  test('shows a stale banner and keeps the last valid specification', async ({ page }) => {
    await openFixture(page);
    await sendSpec(page, BENIGN_SPEC);
    await waitForRender(page);

    await page.evaluate(() => {
      window.__sendPreviewData({
        documentUri: 'file:///fixture.yaml',
        documentVersion: 2,
        version: '3.1',
        stale: true,
      });
    });

    await expect(page.locator('.banner.stale')).toBeVisible();
    await expect(page.locator('iframe')).toHaveCount(1);
    await expect(page.frameLocator('iframe').locator('#mount')).not.toBeEmpty();
  });

  test('warns that ReDoc lacks documented OpenAPI 3.2 support', async ({ page }) => {
    await openFixture(page);
    await sendSpec(page, { ...BENIGN_SPEC, openapi: '3.2.0' }, '3.2');
    await waitForRender(page);

    await expect(page.locator('.banner.warning')).toHaveCount(0);

    await page.selectOption('select >> nth=0', 'redoc');
    await expect(page.locator('.banner.warning')).toBeVisible();
  });

  test('shows an empty state when no specification has ever arrived', async ({ page }) => {
    await openFixture(page);
    await page.evaluate(() => {
      window.__sendPreviewData({
        documentUri: 'file:///fixture.yaml',
        documentVersion: 1,
        stale: true,
      });
    });

    await expect(page.locator('.empty')).toBeVisible();
    await expect(page.locator('iframe.hidden')).toHaveCount(1);
  });
});
