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

  test('proxies renderer "Try it out" fetches to the host, never the network', async ({ page }) => {
    const { escaped, attempted } = await openFixture(page);
    await sendSpec(page, BENIGN_SPEC);
    await waitForRender(page);

    // Fire a request from inside the sealed frame, exactly as Swagger UI's
    // "Try it out" would. The shimmed fetch must reroute it over postMessage.
    const frame = page.frames().find((candidate) => candidate.url().startsWith('blob:'));
    expect(frame).toBeTruthy();
    await frame!.evaluate(() => {
      void fetch('https://try-it.evil.test/pets', { method: 'POST', body: '{"a":1}' });
    });
    await page.waitForTimeout(500);

    // Nothing left the frame over the network...
    expect(escaped).toEqual([]);
    expect(attempted.some((url) => url.includes('try-it.evil.test'))).toBe(false);

    // ...but it surfaced to the host as a proxy request carrying the real target.
    const posted = (await page.evaluate(() => window.__posted)) as Array<{
      type?: string;
      data?: { request?: { url?: string; method?: string } };
    }>;
    const proxy = posted.find((message) => message?.type === 'openApiProxyRequest');
    expect(proxy).toBeTruthy();
    expect(proxy!.data!.request!.url).toBe('https://try-it.evil.test/pets');
    expect(proxy!.data!.request!.method).toBe('POST');
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
    // RapiDoc is not the active renderer, so its bundle must never be fetched.
    expect(requested).not.toMatch(/rapidoc/i);
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

  test('rebuilds the frame when the renderer changes and loads RapiDoc lazily', async ({ page }) => {
    const { attempted, escaped } = await openFixture(page);
    await sendSpec(page, BENIGN_SPEC);
    await waitForRender(page);
    const srcBefore = await page.getAttribute('iframe', 'src');

    await page.selectOption('select >> nth=0', 'rapidoc');
    await waitForRender(page);
    await page.waitForTimeout(1500);

    // A renderer switch rebuilds the sandbox document, so a fresh blob src is set
    // (contrast with a document edit, which rerenders inside the same frame).
    expect(await page.getAttribute('iframe', 'src')).not.toBe(srcBefore);
    // RapiDoc's bundle is fetched lazily only once it becomes the active renderer.
    expect(attempted.join('\n')).toMatch(/rapidoc/i);
    // Nothing escaped to the network during the switch.
    expect(escaped).toEqual([]);
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

  test('warns that RapiDoc lacks documented OpenAPI 3.2 support', async ({ page }) => {
    await openFixture(page);
    await sendSpec(page, { ...BENIGN_SPEC, openapi: '3.2.0' }, '3.2');
    await waitForRender(page);

    await expect(page.locator('.banner.warning')).toHaveCount(0);

    await page.selectOption('select >> nth=0', 'rapidoc');
    await expect(page.locator('.banner.warning')).toBeVisible();
  });

  test('sends the selected operation to the host and remembers the selection', async ({ page }) => {
    await openFixture(page);
    await sendSpec(page, BENIGN_SPEC);
    await waitForRender(page);

    await page.getByRole('button', { name: 'Try It' }).click();

    const posted = await page.evaluate(() => window.__posted);
    expect(posted).toContainEqual({
      type: 'openApiTryOperation',
      data: { path: '/health', method: 'get' },
    });
    // No document URI travels with the message: the host uses its own.
    const state = await page.evaluate(() => window.__state as Record<string, unknown>);
    expect(state.selectedOperationPointer).toBe('/paths/~1health/get');
  });

  test('disables both actions while stale and while an action runs', async ({ page }) => {
    await openFixture(page);
    await sendSpec(page, BENIGN_SPEC);
    await waitForRender(page);

    const tryIt = page.getByRole('button', { name: 'Try It' });
    const generate = page.getByRole('button', { name: 'Generate Collection' });
    await expect(tryIt).toBeEnabled();
    await expect(generate).toBeEnabled();

    await page.evaluate(() => {
      window.postMessage({ type: 'openApiActionStarted', data: { action: 'generateCollection' } }, '*');
    });
    await expect(generate).toBeDisabled();
    await expect(tryIt).toBeDisabled();

    await page.evaluate(() => {
      window.postMessage(
        { type: 'openApiActionSucceeded', data: { action: 'generateCollection', message: 'Collection created.' } },
        '*'
      );
    });
    await expect(generate).toBeEnabled();
    await expect(page.locator('.banner.info')).toHaveText('Collection created.');

    // A document that stopped parsing must not be actioned against.
    await page.evaluate(() => {
      window.__sendPreviewData({
        documentUri: 'file:///fixture.yaml',
        documentVersion: 2,
        version: '3.1',
        stale: true,
      });
    });
    await expect(tryIt).toBeDisabled();
    await expect(generate).toBeDisabled();
  });

  test('reports a failed action inline', async ({ page }) => {
    await openFixture(page);
    await sendSpec(page, BENIGN_SPEC);
    await waitForRender(page);

    await page.getByRole('button', { name: 'Generate Collection' }).click();
    expect(await page.evaluate(() => window.__posted)).toContainEqual({
      type: 'openApiGenerateCollection',
    });

    await page.evaluate(() => {
      window.postMessage(
        { type: 'openApiActionFailed', data: { action: 'generateCollection', message: 'no paths' } },
        '*'
      );
    });

    await expect(page.locator('.banner.error')).toHaveText('no paths');
    await expect(page.getByRole('button', { name: 'Generate Collection' })).toBeEnabled();
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
