import { buildSpecJs, buildStandaloneDocsHtml } from './standaloneDocs';

describe('buildSpecJs', () => {
  it('assigns the spec to the global the shell reads', () => {
    const js = buildSpecJs({ openapi: '3.1.0' });
    expect(js).toContain('window.__NOUTO_OPENAPI_SPEC = ');
    expect(js).toContain('"openapi":"3.1.0"');
  });

  it('escapes angle brackets so hostile content cannot close the script tag', () => {
    const js = buildSpecJs({
      info: { description: 'x</script><script>alert(1)</script>' },
    });
    expect(js).not.toContain('</script>');
    expect(js).not.toContain('<script>');
    // The escaped payload is still plain JSON (unicode escapes are valid
    // JSON), so parsing it back yields the original hostile string intact.
    const json = js.replace('window.__NOUTO_OPENAPI_SPEC = ', '').replace(/;\s*$/, '');
    const parsed = JSON.parse(json) as { info: { description: string } };
    expect(parsed.info.description).toBe('x</script><script>alert(1)</script>');
  });
});

describe('buildStandaloneDocsHtml', () => {
  const base = { title: 'Pets API', js: 'RENDERER_BUNDLE_JS', css: 'RENDERER_CSS' };

  it('inlines the renderer bundle and stylesheet and references spec.js', () => {
    const html = buildStandaloneDocsHtml({ ...base, renderer: 'swagger-ui' });
    expect(html).toContain('RENDERER_BUNDLE_JS');
    expect(html).toContain('RENDERER_CSS');
    expect(html).toContain('<script src="./spec.js"></script>');
    expect(html).not.toContain('__NOUTO_OPENAPI_SPEC = {'); // spec never embedded
  });

  it('escapes the title', () => {
    const html = buildStandaloneDocsHtml({
      ...base,
      title: '<img src=x onerror=alert(1)>',
      renderer: 'swagger-ui',
    });
    expect(html).toContain('<title>&lt;img src=x onerror=alert(1)&gt;</title>');
  });

  it('keeps Swagger UI request execution disabled', () => {
    const html = buildStandaloneDocsHtml({ ...base, renderer: 'swagger-ui' });
    expect(html).toContain('supportedSubmitMethods: []');
    expect(html).toContain('validatorUrl: null');
    expect(html).toContain('tryItOutEnabled: false');
    expect(html).toContain("updateUrl('https://nouto.invalid/openapi.json')");
  });

  it('keeps ReDoc search disabled (workers are blocked on file://)', () => {
    const html = buildStandaloneDocsHtml({ ...base, renderer: 'redoc' });
    expect(html).toContain('disableSearch: true');
    expect(html).toContain('hideDownloadButton: true');
  });

  it('keeps RapiDoc try-it and network features disabled', () => {
    const html = buildStandaloneDocsHtml({ ...base, renderer: 'rapidoc' });
    expect(html).toContain("setAttribute('allow-try', 'false')");
    expect(html).toContain("setAttribute('allow-authentication', 'false')");
    expect(html).toContain("setAttribute('update-route', 'false')");
    expect(html).toContain("setAttribute('load-fonts', 'false')");
  });

  it('includes the inert auto-poll loop', () => {
    const html = buildStandaloneDocsHtml({ ...base, renderer: 'redoc' });
    expect(html).toContain("tag.src = './spec.js?' + n");
    expect(html).toContain('tag.onload = tag.onerror =');
  });
});
