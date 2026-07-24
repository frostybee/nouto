import * as fs from 'fs';
import * as path from 'path';
import { analyzeOpenApi } from '@nouto/core/services';
import type { OpenApiFormat } from '@nouto/core/services';
import { buildOutlineTree } from './buildOutline';
import type { OutlineNode } from './nodes';

const fixture = (name: string) => fs.readFileSync(
  path.join(__dirname, '../../services/openapi/__fixtures__', name),
  'utf8'
);

function outline(name: string) {
  const format: OpenApiFormat = name.endsWith('.json') ? 'json' : 'yaml';
  return buildOutlineTree(`file:///${name}`, analyzeOpenApi(fixture(name), format));
}

function sortedOutline(name: string) {
  const format: OpenApiFormat = name.endsWith('.json') ? 'json' : 'yaml';
  return buildOutlineTree(`file:///${name}`, analyzeOpenApi(fixture(name), format), {
    sortAlphabetically: true,
  });
}

const byLabel = (nodes: OutlineNode[], label: string): OutlineNode | undefined =>
  nodes.find((node) => node.label === label);

/** Builds an outline from an inline spec, for cases no fixture covers. */
function outlineOf(content: string) {
  return buildOutlineTree('file:///inline.yaml', analyzeOpenApi(content, 'yaml'));
}

/** An operation exercising every part of the surface nested under Paths. */
const DETAILED_SPEC = `openapi: 3.1.0
info:
  title: Detail
  version: 1.0.0
paths:
  /pets:
    post:
      tags: [pets]
      parameters:
        - name: page
          in: query
        - $ref: '#/components/parameters/Limit'
      requestBody:
        content:
          application/json: {}
      responses:
        '201':
          description: Created
      callbacks:
        onEvent:
          '{$request.body#/url}': {}
      security:
        - apiKey: []
      servers:
        - url: https://api.example.test
          description: Primary
components:
  parameters:
    Limit:
      name: limit
      in: query
`;

describe('buildOutlineTree', () => {
  it('builds every group in 42Crunch order for a full spec', () => {
    const { roots } = outline('outline-full.yaml');
    expect(roots.map((node) => node.label)).toEqual([
      'Outline Fixture', 'Servers', 'Security', 'Tags', 'Operation ID',
      'Paths', 'Components', 'Webhooks',
    ]);
  });

  it('renders the General node from info with version description', () => {
    const { roots } = outline('outline-full.yaml');
    expect(roots[0]).toMatchObject({
      label: 'Outline Fixture',
      description: 'v2.3.0',
      pointer: '/info',
      iconId: 'info',
    });
  });

  it('groups the root metadata keys under General', () => {
    const { roots, pointerIndex } = outline('outline-full.yaml');
    expect(roots[0].children.map((node) => [node.label, node.description, node.pointer])).toEqual([
      ['openapi', '3.1.0', '/openapi'],
      ['info', undefined, '/info'],
    ]);
    // The version declaration is only reachable through this child.
    expect(pointerIndex.get('/openapi')?.label).toBe('openapi');
  });

  it('keeps General visible when the spec has no info block', () => {
    const { roots } = outlineOf('openapi: 3.1.0\npaths: {}\n');
    expect(roots[0]).toMatchObject({ label: 'General', pointer: undefined });
    expect(roots[0].children.map((node) => node.label)).toEqual(['openapi']);
  });

  it('lists servers with url labels and description details', () => {
    const servers = byLabel(outline('outline-full.yaml').roots, 'Servers')!;
    expect(servers.children.map((node) => node.label)).toEqual([
      'https://api.example.test/v1', 'https://staging.example.test/v1',
    ]);
    expect(servers.children[0].description).toBe('Production');
    expect(servers.children[1].pointer).toBe('/servers/1');
  });

  it('labels global security requirements by scheme, with empty meaning optional', () => {
    const security = byLabel(outline('outline-full.yaml').roots, 'Security')!;
    expect(security.children.map((node) => node.label)).toEqual([
      'apiKeyAuth', 'None (optional)',
    ]);
    expect(security.children[0].pointer).toBe('/security/0');
  });

  it('groups operations by tag, declared tags first, undeclared and untagged after', () => {
    const tags = byLabel(outline('outline-full.yaml').roots, 'Tags')!;
    expect(tags.children.map((node) => node.label)).toEqual([
      'pets', 'unused', 'store', 'Untagged',
    ]);
    const pets = tags.children[0];
    expect(pets.pointer).toBe('/tags/0');
    expect(pets.children.map((node) => node.label)).toEqual(['GET /pets', 'POST /pets']);
    // 'store' has no declaration to reveal; its operations still do.
    expect(tags.children[2].pointer).toBeUndefined();
    expect(tags.children[2].children[0].label).toBe('POST /pets');
    expect(tags.children[3].children[0].label).toBe('GET /health');
  });

  it('sorts the Operation ID group alphabetically and skips id-less operations', () => {
    const ids = byLabel(outline('outline-full.yaml').roots, 'Operation ID')!;
    expect(ids.children.map((node) => node.label)).toEqual(['getHealth', 'listPets']);
    expect(ids.children[1]).toMatchObject({
      description: 'GET /pets',
      contextValue: 'outlineOperation pointer',
      pointer: '/paths/~1pets/get',
    });
  });

  it('mirrors paths with operation counts and pointer-backed operations', () => {
    const paths = byLabel(outline('outline-full.yaml').roots, 'Paths')!;
    expect(paths.children.map((node) => node.label)).toEqual(['/pets', '/health']);
    expect(paths.children[0].description).toBe('2 operations');
    expect(paths.children[1].description).toBe('1 operation');
    expect(paths.children[0].iconId).toBe('folder');
    expect(paths.children[0].children[0]).toMatchObject({
      label: 'GET /pets',
      description: 'List pets',
      contextValue: 'outlineOperation pointer',
      pointer: '/paths/~1pets/get',
      operation: { path: '/pets', method: 'get' },
      iconId: 'circle-filled',
      iconColor: 'charts.green',
    });
    expect(paths.children[0].children[1].iconColor).toBe('charts.yellow');
  });

  describe('operation drill-down', () => {
    const operationOf = (spec: string) =>
      byLabel(outlineOf(spec).roots, 'Paths')!.children[0].children[0];

    it('nests the whole operation surface in document-shaped order', () => {
      const operation = operationOf(DETAILED_SPEC);
      expect(operation.children.map((node) => node.label)).toEqual([
        'parameters', 'requestBody', 'responses', 'callbacks', 'security', 'servers', 'tags',
      ]);
      expect(byLabel(operation.children, 'responses')).toMatchObject({
        iconId: 'reply',
        contextValue: 'outlineOperationSection pointer',
        pointer: '/paths/~1pets/post/responses',
      });
    });

    it('labels parameters by name and falls back to the $ref target', () => {
      const parameters = byLabel(operationOf(DETAILED_SPEC).children, 'parameters')!;
      expect(parameters.children.map((node) => [node.label, node.description])).toEqual([
        ['page', 'query'],
        ['Limit', '$ref'],
      ]);
      expect(parameters.children[0].pointer).toBe('/paths/~1pets/post/parameters/0');
    });

    it('lists response codes with their descriptions', () => {
      const responses = byLabel(operationOf(DETAILED_SPEC).children, 'responses')!;
      expect(responses.children).toHaveLength(1);
      expect(responses.children[0]).toMatchObject({
        label: '201',
        description: 'Created',
        iconId: 'symbol-numeric',
        pointer: '/paths/~1pets/post/responses/201',
      });
    });

    it('reuses the root label conventions for security, servers, and tags', () => {
      const operation = operationOf(DETAILED_SPEC);
      expect(byLabel(operation.children, 'security')!.children[0].label).toBe('apiKey');
      expect(byLabel(operation.children, 'servers')!.children[0]).toMatchObject({
        label: 'https://api.example.test',
        description: 'Primary',
      });
      expect(byLabel(operation.children, 'tags')!.children.map((n) => n.label)).toEqual(['pets']);
    });

    it('indexes nested pointers so cursor sync can resolve them', () => {
      const { pointerIndex } = outlineOf(DETAILED_SPEC);
      expect(pointerIndex.get('/paths/~1pets/post/responses/201')?.label).toBe('201');
      expect(pointerIndex.get('/paths/~1pets/post/parameters/1')?.label).toBe('Limit');
    });

    it('omits sections the operation does not declare', () => {
      // The fixture's GET /pets has only responses and tags.
      const operation = byLabel(outline('outline-full.yaml').roots, 'Paths')!.children[0].children[0];
      expect(operation.children.map((node) => node.label)).toEqual(['responses', 'tags']);
    });

    it('keeps Tags and Operation ID flat indexes over the same operations', () => {
      const { roots } = outlineOf(DETAILED_SPEC);
      const tagged = byLabel(roots, 'Tags')!.children[0].children[0];
      expect(tagged.label).toBe('POST /pets');
      expect(tagged.children).toEqual([]);
      const paths = byLabel(roots, 'Paths')!.children[0].children[0];
      expect(paths.children.length).toBeGreaterThan(0);
    });

    it('drills into webhook operations too', () => {
      const webhooks = byLabel(outline('outline-full.yaml').roots, 'Webhooks')!;
      const operation = webhooks.children[0].children[0];
      expect(operation.label).toBe('POST petAdded');
      expect(operation.children.map((node) => node.label)).toEqual(['responses']);
      expect(operation.children[0].children[0].pointer)
        .toBe('/webhooks/petAdded/post/responses/200');
    });
  });

  it('renders component sections with per-section icons', () => {
    const components = byLabel(outline('outline-full.yaml').roots, 'Components')!;
    expect(components.children.map((node) => node.label)).toEqual(['schemas', 'securitySchemes']);
    const schemas = components.children[0];
    expect(schemas.iconId).toBe('folder');
    expect(schemas.children.map((node) => node.label)).toEqual(['Pet', 'Error']);
    expect(schemas.children[0]).toMatchObject({
      iconId: 'symbol-class',
      pointer: '/components/schemas/Pet',
    });
    expect(components.children[1].children[0].iconId).toBe('symbol-interface');
  });

  describe('alphabetical sort', () => {
    it('orders Paths, Components items, and Tags alphabetically while keeping operations in document order', () => {
      const { roots } = sortedOutline('outline-full.yaml');
      const paths = byLabel(roots, 'Paths')!;
      expect(paths.children.map((node) => node.label)).toEqual(['/health', '/pets']);
      // Operations within a path stay in document order (no method reshuffle).
      expect(paths.children[1].children.map((node) => node.label)).toEqual(['GET /pets', 'POST /pets']);

      const schemas = byLabel(roots, 'Components')!.children[0];
      expect(schemas.children.map((node) => node.label)).toEqual(['Error', 'Pet']);

      const tags = byLabel(roots, 'Tags')!;
      // Declared + used tags sorted; the Untagged bucket stays last.
      expect(tags.children.map((node) => node.label)).toEqual(['pets', 'store', 'unused', 'Untagged']);
    });

    it('preserves original server/webhook pointers when sorting by label', () => {
      const { roots } = sortedOutline('outline-full.yaml');
      const servers = byLabel(roots, 'Servers')!;
      expect(servers.children.map((node) => node.label)).toEqual([
        'https://api.example.test/v1', 'https://staging.example.test/v1',
      ]);
      // First entry sorts first here, so its pointer is still /servers/0.
      expect(servers.children[0].pointer).toBe('/servers/0');
      expect(servers.children[1].pointer).toBe('/servers/1');
    });

    it('leaves the outline in document order by default', () => {
      const paths = byLabel(outline('outline-full.yaml').roots, 'Paths')!;
      expect(paths.children.map((node) => node.label)).toEqual(['/pets', '/health']);
    });
  });

  it('renders webhook operations for 3.1 documents', () => {
    const webhooks = byLabel(outline('outline-full.yaml').roots, 'Webhooks')!;
    expect(webhooks.children[0].label).toBe('petAdded');
    expect(webhooks.children[0].children[0]).toMatchObject({
      label: 'POST petAdded',
      description: 'Pet added',
      pointer: '/webhooks/petAdded/post',
    });
  });

  it('prefers the Paths copy of an operation in the pointer index', () => {
    const { pointerIndex } = outline('outline-full.yaml');
    const operation = pointerIndex.get('/paths/~1pets/get')!;
    expect(operation.parent?.label).toBe('/pets');
    expect(operation.parent?.parent?.label).toBe('Paths');
  });

  it('wires parent back-references all the way to the root', () => {
    const { roots } = outline('outline-full.yaml');
    const schema = byLabel(roots, 'Components')!.children[0].children[0];
    expect(schema.parent?.label).toBe('schemas');
    expect(schema.parent?.parent?.label).toBe('Components');
    expect(schema.parent?.parent?.parent).toBeUndefined();
    expect(schema.id).toBe('components/schemas/Pet');
  });

  it('always renders top-level groups, without pointers for absent sections', () => {
    const { roots } = outline('minimal-3.1.yaml');
    for (const label of ['Servers', 'Security', 'Tags', 'Paths', 'Components', 'Webhooks']) {
      const group = byLabel(roots, label);
      expect(group).toBeDefined();
      if (!['Tags', 'Paths'].includes(label)) expect(group!.children).toEqual([]);
      // Absent sections have no spec location: no pointer, no pointer token.
      if (group!.pointer === undefined) {
        expect(group!.contextValue ?? '').not.toMatch(/\bpointer\b/);
      }
    }
  });

  it('omits the webhooks group for 3.0 documents', () => {
    const { roots } = buildOutlineTree(
      'file:///spec-3.0.yaml',
      analyzeOpenApi('openapi: 3.0.3\ninfo:\n  title: T\n  version: 1.0.0\n', 'yaml')
    );
    expect(byLabel(roots, 'Webhooks')).toBeUndefined();
    expect(byLabel(roots, 'Paths')).toBeDefined();
  });

  it('returns an empty outline when the document does not parse', () => {
    const { roots, pointerIndex } = outline('malformed.yaml');
    expect(roots).toEqual([]);
    expect(pointerIndex.size).toBe(0);
  });

  describe('context-menu taxonomy', () => {
    it('appends the pointer token exactly to pointer-bearing nodes', () => {
      const { roots } = outline('outline-full.yaml');
      const visit = (nodes: OutlineNode[]): void => {
        for (const node of nodes) {
          if (node.pointer !== undefined) {
            expect(node.contextValue).toMatch(/\bpointer\b/);
          } else {
            expect(node.contextValue ?? '').not.toMatch(/\bpointer\b/);
          }
          visit(node.children);
        }
      };
      visit(roots);
    });

    it('assigns the expected base contextValue per node kind', () => {
      const { roots } = outline('outline-full.yaml');
      expect(byLabel(roots, 'Outline Fixture')!.contextValue).toBe('outlineInfo pointer');
      const servers = byLabel(roots, 'Servers')!;
      expect(servers.contextValue).toBe('outlineServersGroup pointer');
      expect(servers.children[0].contextValue).toBe('outlineServer pointer');
      const security = byLabel(roots, 'Security')!;
      expect(security.contextValue).toBe('outlineSecurityGroup pointer');
      expect(security.children[0].contextValue).toBe('outlineSecurityRequirement pointer');
      const tags = byLabel(roots, 'Tags')!;
      expect(tags.contextValue).toBe('outlineTagsGroup pointer');
      expect(byLabel(tags.children, 'pets')!.contextValue).toBe('outlineTag pointer');
      // Fallback tags and the Untagged group have no spec location: no menus.
      expect(byLabel(tags.children, 'store')!.contextValue).toBeUndefined();
      expect(byLabel(tags.children, 'Untagged')!.contextValue).toBeUndefined();
      const paths = byLabel(roots, 'Paths')!;
      expect(paths.contextValue).toBe('outlinePathsGroup pointer');
      expect(paths.children[0].contextValue).toBe('outlinePath pointer');
      expect(paths.children[0].path).toBe('/pets');
      const components = byLabel(roots, 'Components')!;
      expect(components.contextValue).toBe('outlineComponentsGroup pointer');
      const schemas = byLabel(components.children, 'schemas')!;
      expect(schemas.contextValue).toBe('outlineComponentSection pointer');
      expect(schemas.component).toEqual({ section: 'schemas' });
      expect(schemas.children[0].contextValue).toBe('outlineComponentItem pointer');
      expect(schemas.children[0].component).toEqual({ section: 'schemas', name: 'Pet' });
      expect(byLabel(components.children, 'securitySchemes')!.contextValue)
        .toBe('outlineComponentSection outlineSecuritySchemesSection pointer');
      const webhooks = byLabel(roots, 'Webhooks')!;
      expect(webhooks.contextValue).toBe('outlineWebhooksGroup pointer');
      const webhook = webhooks.children[0];
      expect(webhook.contextValue).toBe('outlineWebhook pointer');
      expect(webhook.path).toBe('petAdded');
      expect(webhook.children[0].contextValue).toBe('outlineWebhookOperation pointer');
      // Webhook operations must not offer Try It.
      expect(webhook.children[0].operation).toBeUndefined();
    });

    it('renders operation-less path items with a zero count', () => {
      const { roots } = buildOutlineTree(
        'file:///spec-empty-path.yaml',
        analyzeOpenApi(
          'openapi: 3.1.0\ninfo:\n  title: T\n  version: 1.0.0\npaths:\n  /empty: {}\n',
          'yaml'
        )
      );
      const empty = byLabel(byLabel(roots, 'Paths')!.children, '/empty')!;
      expect(empty.contextValue).toBe('outlinePath pointer');
      expect(empty.description).toBe('0 operations');
      expect(empty.children).toEqual([]);
    });

    it('renders present-but-empty component sections', () => {
      const { roots } = buildOutlineTree(
        'file:///spec-empty-section.yaml',
        analyzeOpenApi(
          'openapi: 3.1.0\ninfo:\n  title: T\n  version: 1.0.0\ncomponents:\n  schemas: {}\n',
          'yaml'
        )
      );
      const schemas = byLabel(byLabel(roots, 'Components')!.children, 'schemas')!;
      expect(schemas.children).toEqual([]);
    });
  });
});
