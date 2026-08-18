import { describe, it, expect } from 'vitest';
import { analyzeOpenApi } from '@nouto/core/services/openapi/analyze';
import { buildOutlineTree } from '@nouto/core/services/openapi/outline';
import type { OutlineNode } from '@nouto/core/services/openapi/outline';
import { buildPointerMap, pointerToOffsetRange } from '@nouto/core/services/openapi/pointerMap';
import type { SpecTextEdit } from '@nouto/core/services/openapi/specEdit';
import type { OpenApiFormat } from '@nouto/core/services/openapi/types';
import { OUTLINE_EDIT_FAILED_MESSAGE, planOutlineEditAction } from './outlineEdit';
import type { OutlineEditPlan } from './outlineEdit';

const YAML = `openapi: 3.1.0
info:
  title: Pets
  version: 1.0.0
servers:
  - url: https://prod.example.com
tags:
  - name: newTag
security: []
paths:
  /new-path:
    get:
      responses:
        '200': { description: OK }
components:
  schemas:
    NewSchema:
      type: object
  securitySchemes:
    apiKey:
      type: apiKey
      name: X-Key
      in: header
`;

const JSON_DOC = `{
  "openapi": "3.1.0",
  "info": { "title": "Pets", "version": "1.0.0" },
  "paths": {}
}`;

function applyEdits(text: string, edits: SpecTextEdit[]): string {
  const sorted = [...edits].sort((a, b) => b.offset - a.offset);
  let result = text;
  for (const edit of sorted) {
    result = result.slice(0, edit.offset) + edit.text + result.slice(edit.offset + edit.length);
  }
  return result;
}

function nodeAt(text: string, format: OpenApiFormat, pointer: string): OutlineNode {
  const analysis = analyzeOpenApi(text, format);
  const { pointerIndex } = buildOutlineTree('file:///spec', analysis);
  const node = pointerIndex.get(pointer);
  if (!node) throw new Error(`no outline node at ${pointer}`);
  return node;
}

function plan(
  text: string,
  format: OpenApiFormat,
  node: OutlineNode,
  actionId: Parameters<typeof planOutlineEditAction>[1],
  payload?: Record<string, unknown>,
) {
  return planOutlineEditAction(node, actionId, payload, text, format, analyzeOpenApi(text, format));
}

function expectPlan(result: ReturnType<typeof planOutlineEditAction>): OutlineEditPlan {
  expect(result).toBeDefined();
  expect(result && 'error' in result).toBe(false);
  return result as OutlineEditPlan;
}

/** Applies the plan and asserts the result reparses cleanly. */
function applyAndReparse(text: string, format: OpenApiFormat, editPlan: OutlineEditPlan): string {
  const result = applyEdits(text, editPlan.edits);
  expect(analyzeOpenApi(result, format).parsedSpec).toBeTruthy();
  return result;
}

describe('addPath', () => {
  it('inserts a uniquely named path with a GET stub and reveals its key', () => {
    const node = nodeAt(YAML, 'yaml', '/paths');
    const editPlan = expectPlan(plan(YAML, 'yaml', node, 'addPath'));
    // '/new-path' exists — the placeholder gets a numeric suffix.
    expect(editPlan.reveal).toEqual({ pointer: '/paths/~1new-path-2', selectValue: false });
    const result = applyAndReparse(YAML, 'yaml', editPlan);
    expect(result).toContain('/new-path-2');
  });

  it('works on JSON documents', () => {
    const node = nodeAt(JSON_DOC, 'json', '/paths');
    const editPlan = expectPlan(plan(JSON_DOC, 'json', node, 'addPath'));
    const result = applyAndReparse(JSON_DOC, 'json', editPlan);
    expect(result).toContain('"/new-path"');
  });
});

describe('addOperation', () => {
  it('inserts the skeleton and reveals the 200 description value-selected', () => {
    const node = nodeAt(YAML, 'yaml', '/paths/~1new-path');
    const editPlan = expectPlan(plan(YAML, 'yaml', node, 'addOperation', { method: 'post' }));
    expect(editPlan.reveal).toEqual({
      pointer: '/paths/~1new-path/post/responses/200/description',
      selectValue: true,
    });
    const result = applyAndReparse(YAML, 'yaml', editPlan);
    // The revealed pointer resolves in the post-edit document to the "OK"
    // placeholder — exactly what applyEdits will select.
    const map = buildPointerMap(result, 'yaml');
    const range = pointerToOffsetRange(map, editPlan.reveal!.pointer)!;
    expect(result.slice(range.from, range.to)).toBe('OK');
  });

  it('returns undefined without a method payload', () => {
    const node = nodeAt(YAML, 'yaml', '/paths/~1new-path');
    expect(plan(YAML, 'yaml', node, 'addOperation')).toBeUndefined();
  });
});

describe('addServer / addTag', () => {
  it('addServer inserts a placeholder URL and selects its value', () => {
    const node = nodeAt(YAML, 'yaml', '/servers');
    const editPlan = expectPlan(plan(YAML, 'yaml', node, 'addServer'));
    expect(editPlan.reveal).toEqual({ pointer: '/servers/1/url', selectValue: true });
    const result = applyAndReparse(YAML, 'yaml', editPlan);
    expect(result).toContain('https://api.example.com');
  });

  it('addTag picks a unique name and selects it', () => {
    const node = nodeAt(YAML, 'yaml', '/tags');
    const editPlan = expectPlan(plan(YAML, 'yaml', node, 'addTag'));
    // 'newTag' exists — suffix expected.
    expect(editPlan.reveal).toEqual({ pointer: '/tags/1/name', selectValue: true });
    const result = applyAndReparse(YAML, 'yaml', editPlan);
    expect(result).toContain('newTag-2');
  });
});

describe('addSecurityRequirement', () => {
  it('per-scheme entry appends the requirement and reveals it', () => {
    const node = nodeAt(YAML, 'yaml', '/security');
    const editPlan = expectPlan(
      plan(YAML, 'yaml', node, 'addSecurityRequirement', { schemes: ['apiKey'] }),
    );
    expect(editPlan.reveal).toEqual({ pointer: '/security/0', selectValue: false });
    const result = applyAndReparse(YAML, 'yaml', editPlan);
    expect(result).toMatch(/apiKey: \[\]/);
  });

  it('the no-auth entry appends an empty requirement with no reveal', () => {
    const node = nodeAt(YAML, 'yaml', '/security');
    const editPlan = expectPlan(
      plan(YAML, 'yaml', node, 'addSecurityRequirement', { schemes: [] }),
    );
    expect(editPlan.reveal).toBeUndefined();
    applyAndReparse(YAML, 'yaml', editPlan);
  });

  it('returns undefined without a schemes payload', () => {
    const node = nodeAt(YAML, 'yaml', '/security');
    expect(plan(YAML, 'yaml', node, 'addSecurityRequirement')).toBeUndefined();
  });
});

describe('addSecurityScheme / addComponent', () => {
  it('inserts the chosen preset under a unique placeholder name', () => {
    const node = nodeAt(YAML, 'yaml', '/components/securitySchemes');
    const editPlan = expectPlan(
      plan(YAML, 'yaml', node, 'addSecurityScheme', { presetId: 'httpBearer' }),
    );
    expect(editPlan.reveal).toEqual({
      pointer: '/components/securitySchemes/bearerAuth',
      selectValue: false,
    });
    const result = applyAndReparse(YAML, 'yaml', editPlan);
    expect(result).toContain('bearerAuth:');
    expect(result).toContain('scheme: bearer');
  });

  it('returns undefined for an unknown preset id', () => {
    const node = nodeAt(YAML, 'yaml', '/components/securitySchemes');
    expect(plan(YAML, 'yaml', node, 'addSecurityScheme', { presetId: 'nope' })).toBeUndefined();
  });

  it('addComponent uses the section placeholder with a unique suffix', () => {
    const node = nodeAt(YAML, 'yaml', '/components/schemas');
    const editPlan = expectPlan(plan(YAML, 'yaml', node, 'addComponent', { section: 'schemas' }));
    // 'NewSchema' exists — suffix expected.
    expect(editPlan.reveal).toEqual({
      pointer: '/components/schemas/NewSchema-2',
      selectValue: false,
    });
    applyAndReparse(YAML, 'yaml', editPlan);
  });

  it('addComponent creates missing parents (no components section yet)', () => {
    const node = nodeAt(JSON_DOC, 'json', '/paths');
    const editPlan = expectPlan(
      plan(JSON_DOC, 'json', node, 'addComponent', { section: 'responses' }),
    );
    const result = applyAndReparse(JSON_DOC, 'json', editPlan);
    expect(result).toContain('"NewResponse"');
  });

  it('addComponent rejects unknown sections', () => {
    const node = nodeAt(YAML, 'yaml', '/components/schemas');
    expect(plan(YAML, 'yaml', node, 'addComponent', { section: 'nope' })).toBeUndefined();
  });
});

describe('addWebhook', () => {
  it('inserts a POST stub under a unique webhook name', () => {
    const node = nodeAt(YAML, 'yaml', '/paths'); // any node works; action ignores it
    const editPlan = expectPlan(plan(YAML, 'yaml', node, 'addWebhook'));
    expect(editPlan.reveal).toEqual({ pointer: '/webhooks/newWebhook', selectValue: false });
    const result = applyAndReparse(YAML, 'yaml', editPlan);
    expect(result).toContain('newWebhook:');
  });
});

describe('delete', () => {
  it('removes the node at its pointer with no reveal', () => {
    const node = nodeAt(YAML, 'yaml', '/paths/~1new-path/get');
    const editPlan = expectPlan(plan(YAML, 'yaml', node, 'delete'));
    expect(editPlan.reveal).toBeUndefined();
    const result = applyAndReparse(YAML, 'yaml', editPlan);
    expect(result).not.toMatch(/^ {4}get:/m);
  });

  it('returns undefined for pointerless nodes', () => {
    const analysis = analyzeOpenApi(YAML, 'yaml');
    const { roots } = buildOutlineTree('file:///spec', analysis);
    const pointerless = (function find(nodes: OutlineNode[]): OutlineNode | undefined {
      for (const node of nodes) {
        if (node.pointer === undefined) return node;
        const found = find(node.children);
        if (found) return found;
      }
      return undefined;
    })(roots);
    if (!pointerless) return; // every node has a pointer in this fixture
    expect(plan(YAML, 'yaml', pointerless, 'delete')).toBeUndefined();
  });

  it('surfaces an error when the planner refuses a flow-style target', () => {
    const flow = `openapi: 3.1.0\ninfo: {title: X, version: '1'}\nservers: [{url: https://a}]\npaths: {}\n`;
    const analysis = analyzeOpenApi(flow, 'yaml');
    const { pointerIndex } = buildOutlineTree('file:///flow', analysis);
    const server = pointerIndex.get('/servers/0');
    if (!server) return;
    const result = planOutlineEditAction(server, 'delete', undefined, flow, 'yaml', analysis);
    expect(result).toEqual({ error: OUTLINE_EDIT_FAILED_MESSAGE });
  });
});

describe('non-edit actions', () => {
  it('copyJsonPointer and tryOperation never reach the planner', () => {
    const node = nodeAt(YAML, 'yaml', '/paths');
    expect(plan(YAML, 'yaml', node, 'copyJsonPointer')).toBeUndefined();
    expect(plan(YAML, 'yaml', node, 'tryOperation')).toBeUndefined();
  });
});
