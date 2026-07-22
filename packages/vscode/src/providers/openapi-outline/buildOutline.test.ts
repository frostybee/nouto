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

const byLabel = (nodes: OutlineNode[], label: string): OutlineNode | undefined =>
  nodes.find((node) => node.label === label);

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
    expect(roots[0].children).toHaveLength(0);
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
      contextValue: 'outlineOperation',
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
      contextValue: 'outlineOperation',
      pointer: '/paths/~1pets/get',
      operation: { path: '/pets', method: 'get' },
      iconId: 'circle-filled',
      iconColor: 'charts.green',
    });
    expect(paths.children[0].children[1].iconColor).toBe('charts.yellow');
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

  it('omits groups absent from the document', () => {
    const { roots } = outline('minimal-3.1.yaml');
    const labels = roots.map((node) => node.label);
    expect(labels).not.toContain('Servers');
    expect(labels).not.toContain('Security');
    expect(labels).not.toContain('Components');
    expect(labels).not.toContain('Webhooks');
  });

  it('returns an empty outline when the document does not parse', () => {
    const { roots, pointerIndex } = outline('malformed.yaml');
    expect(roots).toEqual([]);
    expect(pointerIndex.size).toBe(0);
  });
});
