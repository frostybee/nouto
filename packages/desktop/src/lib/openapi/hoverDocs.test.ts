import { describe, it, expect } from 'vitest';
import { buildPointerMap } from '@nouto/core/services/openapi/pointerMap';
import { resolveHoverDocs } from './hoverDocs';

const YAML = `openapi: 3.1.0
info:
  title: Pets
  version: 1.0.0
paths:
  /pets:
    get:
      summary: List pets
      responses:
        '200':
          description: OK
`;

const JSON_DOC = `{
  "openapi": "3.1.0",
  "info": { "title": "Pets", "version": "1.0.0" }
}`;

function offsetOf(text: string, marker: string): number {
  const index = text.indexOf(marker);
  if (index === -1) throw new Error(`marker ${marker} not found`);
  return index;
}

describe('resolveHoverDocs — YAML', () => {
  const map = buildPointerMap(YAML, 'yaml');

  it('returns curated docs when hovering a property key', () => {
    const result = resolveHoverDocs(map, offsetOf(YAML, 'summary'), '3.1');
    expect(result).toBeDefined();
    expect(result!.docs.toLowerCase()).toContain('summary');
    // Range covers the key itself.
    expect(YAML.slice(result!.range.from, result!.range.to)).toBe('summary');
  });

  it('classifies the parent to pick the right table', () => {
    const result = resolveHoverDocs(map, offsetOf(YAML, 'title'), '3.1');
    expect(result).toBeDefined();
    expect(YAML.slice(result!.range.from, result!.range.to)).toBe('title');
  });

  it('returns undefined when hovering a value', () => {
    expect(resolveHoverDocs(map, offsetOf(YAML, 'List pets') + 2, '3.1')).toBeUndefined();
  });

  it('returns undefined for keys with no curated docs', () => {
    // '200' under Responses has no per-property docs entry.
    expect(resolveHoverDocs(map, offsetOf(YAML, "'200'") + 1, '3.1')).toBeUndefined();
  });

  it('returns undefined on whitespace', () => {
    expect(resolveHoverDocs(map, offsetOf(YAML, 'info:') - 1, '3.1')).toBeUndefined();
  });
});

describe('resolveHoverDocs — JSON', () => {
  const map = buildPointerMap(JSON_DOC, 'json');

  it('returns docs for a JSON property key', () => {
    const result = resolveHoverDocs(map, offsetOf(JSON_DOC, '"title"') + 2, '3.1');
    expect(result).toBeDefined();
    expect(result!.docs).toBeTruthy();
  });

  it('returns undefined inside a JSON value string', () => {
    expect(resolveHoverDocs(map, offsetOf(JSON_DOC, 'Pets'), '3.1')).toBeUndefined();
  });
});
