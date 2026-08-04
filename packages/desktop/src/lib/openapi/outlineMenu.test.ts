import { describe, it, expect } from 'vitest';
import { analyzeOpenApi } from '@nouto/core/services/openapi/analyze';
import { buildOutlineTree } from '@nouto/core/services/openapi/outline';
import type { OutlineNode } from '@nouto/core/services/openapi/outline';
import { buildOutlineMenu } from './outlineMenu';

const YAML = `openapi: 3.1.0
info:
  title: Pets
  version: 1.0.0
servers:
  - url: https://api.example.com
tags:
  - name: pets
security:
  - apiKey: []
paths:
  /pets:
    get:
      operationId: listPets
      responses:
        '200': { description: OK }
components:
  schemas:
    Pet:
      type: object
  securitySchemes:
    apiKey:
      type: apiKey
      name: X-Key
      in: header
webhooks:
  newPet:
    post:
      responses:
        '200': { description: OK }
`;

const analysis = analyzeOpenApi(YAML, 'yaml');
const { roots } = buildOutlineTree('file:///spec.yaml', analysis);

function search(
  predicate: (node: OutlineNode) => boolean,
  nodes: OutlineNode[]
): OutlineNode | undefined {
  for (const node of nodes) {
    if (predicate(node)) return node;
    const found = search(predicate, node.children);
    if (found) return found;
  }
  return undefined;
}

function findNode(predicate: (node: OutlineNode) => boolean, nodes: OutlineNode[] = roots): OutlineNode {
  const found = search(predicate, nodes);
  if (!found) throw new Error('node not found');
  return found;
}

function byContext(token: string): OutlineNode {
  return findNode((node) => (node.contextValue ?? '').split(' ').includes(token));
}

function menu(node: OutlineNode, hasErrors = false) {
  return buildOutlineMenu(node, analysis, hasErrors);
}

function labels(node: OutlineNode, hasErrors = false): string[] {
  return menu(node, hasErrors).filter((entry) => !entry.divider).map((entry) => entry.label);
}

describe('buildOutlineMenu — groups', () => {
  it('Paths group offers Add Path', () => {
    expect(labels(byContext('outlinePathsGroup'))).toEqual(['Add Path', 'Copy JSON Pointer']);
  });

  it('a path offers one Add entry per unused method plus delete', () => {
    const items = labels(byContext('outlinePath'));
    expect(items).not.toContain('Add GET Operation');
    expect(items).toContain('Add POST Operation');
    expect(items).toContain('Add DELETE Operation');
    expect(items).toContain('Copy JSON Pointer');
    expect(items).toContain('Delete Path');
  });

  it('Servers group offers Add Server; a server offers delete', () => {
    expect(labels(byContext('outlineServersGroup'))).toContain('Add Server');
    expect(labels(byContext('outlineServer'))).toEqual(['Copy JSON Pointer', 'Delete Server']);
  });

  it('Tags group offers Add Tag; a tag offers delete', () => {
    expect(labels(byContext('outlineTagsGroup'))).toContain('Add Tag');
    expect(labels(byContext('outlineTag'))).toEqual(['Copy JSON Pointer', 'Delete Tag']);
  });

  it('Security group expands declared schemes plus the no-auth entry', () => {
    const items = menu(byContext('outlineSecurityGroup')).filter((entry) => !entry.divider);
    const requirementEntries = items.filter((entry) => entry.id === 'addSecurityRequirement');
    expect(requirementEntries.map((entry) => entry.label)).toEqual([
      'Add Requirement: apiKey',
      'Add Requirement: no authentication (optional)',
    ]);
    expect(requirementEntries[0].payload).toEqual({ schemes: ['apiKey'] });
    expect(requirementEntries[1].payload).toEqual({ schemes: [] });
  });

  it('Components group offers the 14 flat entries (9 sections + 5 scheme presets)', () => {
    const adds = menu(byContext('outlineComponentsGroup')).filter(
      (entry) => entry.id === 'addComponent' || entry.id === 'addSecurityScheme'
    );
    expect(adds).toHaveLength(14);
    expect(adds.filter((entry) => entry.id === 'addSecurityScheme')).toHaveLength(5);
  });

  it('a plain component section offers its single Add; securitySchemes offers the presets', () => {
    const schemas = findNode(
      (node) => node.component?.section === 'schemas' && node.component.name === undefined
    );
    expect(labels(schemas)).toContain('Add Schema');
    const schemes = byContext('outlineSecuritySchemesSection');
    const adds = menu(schemes).filter((entry) => entry.id === 'addSecurityScheme');
    expect(adds).toHaveLength(5);
    expect(adds[0].payload).toEqual({ presetId: 'apiKey' });
  });

  it('a component item offers delete', () => {
    expect(labels(byContext('outlineComponentItem'))).toEqual([
      'Copy JSON Pointer',
      'Delete Component',
    ]);
  });

  it('Webhooks group offers Add Webhook; a webhook offers unused methods + delete', () => {
    expect(labels(byContext('outlineWebhooksGroup'))).toContain('Add Webhook');
    const webhook = labels(byContext('outlineWebhook'));
    expect(webhook).toContain('Add GET Operation');
    expect(webhook).not.toContain('Add POST Operation');
    expect(webhook).toContain('Delete Webhook');
  });
});

describe('buildOutlineMenu — operations and guards', () => {
  it('an operation offers Try It, copy, and delete', () => {
    const operation = byContext('outlineOperation');
    const items = menu(operation).filter((entry) => !entry.divider);
    expect(items.map((entry) => entry.id)).toEqual(['tryOperation', 'copyJsonPointer', 'delete']);
    expect(items[2].label).toBe('Delete Operation');
    expect(items[2].danger).toBe(true);
  });

  it('hasErrors disables edits but not Copy JSON Pointer or Try It', () => {
    const operation = byContext('outlineOperation');
    const items = menu(operation, true).filter((entry) => !entry.divider);
    expect(items.find((entry) => entry.id === 'delete')!.disabled).toBe(true);
    expect(items.find((entry) => entry.id === 'copyJsonPointer')!.disabled).toBeFalsy();
    expect(items.find((entry) => entry.id === 'tryOperation')!.disabled).toBeFalsy();
    const pathAdds = menu(byContext('outlinePath'), true).filter((e) => e.id === 'addOperation');
    expect(pathAdds.every((entry) => entry.disabled)).toBe(true);
  });

  it('an info value row offers only Copy JSON Pointer', () => {
    expect(labels(byContext('outlineGeneralItem'))).toEqual(['Copy JSON Pointer']);
  });

  it('a path with every method used offers no Add Operation entries', () => {
    const full = `openapi: 3.1.0\ninfo: {title: X, version: '1'}\npaths:\n  /a:\n${[
      'get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace', 'query',
    ]
      .map((method) => `    ${method}:\n      responses: {'200': {description: OK}}`)
      .join('\n')}\n`;
    const fullAnalysis = analyzeOpenApi(full, 'yaml');
    const tree = buildOutlineTree('file:///full.yaml', fullAnalysis);
    const path = (function find(nodes: OutlineNode[]): OutlineNode | undefined {
      for (const node of nodes) {
        if ((node.contextValue ?? '').split(' ').includes('outlinePath')) return node;
        const found = find(node.children);
        if (found) return found;
      }
      return undefined;
    })(tree.roots)!;
    const adds = buildOutlineMenu(path, fullAnalysis, false).filter(
      (entry) => entry.id === 'addOperation'
    );
    expect(adds).toEqual([]);
  });
});
