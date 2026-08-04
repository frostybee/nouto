import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { analyzeOpenApi } from '@nouto/core/services/openapi/analyze';
import type { OpenApiAnalysis } from '@nouto/core/services/openapi/types';
import OpenApiOutlineTree from './OpenApiOutlineTree.svelte';

const YAML = `openapi: 3.1.0
info:
  title: T
  version: 1.0.0
paths:
  /b:
    get:
      responses:
        '200':
          description: OK
  /a:
    post:
      responses:
        '200':
          description: OK
`;

interface TreeProps {
  analysis: OpenApiAnalysis | null;
  documentUri: string;
  sortAlphabetically: boolean;
  activePointer?: string;
  onreveal: (pointer: string) => void;
}

describe('OpenApiOutlineTree', () => {
  let target: HTMLElement;
  let instance: Record<string, unknown> | undefined;

  beforeEach(() => {
    target = document.createElement('div');
    document.body.appendChild(target);
  });

  afterEach(() => {
    if (instance) unmount(instance);
    instance = undefined;
    target.remove();
  });

  function mountTree(overrides: Partial<TreeProps> = {}) {
    const props = $state<TreeProps>({
      analysis: analyzeOpenApi(YAML, 'yaml'),
      documentUri: '/tmp/api.yaml',
      sortAlphabetically: false,
      activePointer: undefined,
      onreveal: vi.fn(),
      ...overrides,
    });
    instance = mount(OpenApiOutlineTree, { target, props });
    flushSync();
    return props;
  }

  function rows(): HTMLElement[] {
    return [...target.querySelectorAll<HTMLElement>('[role="treeitem"]')];
  }

  function rowByText(text: string): HTMLElement | undefined {
    return rows().find((row) => row.textContent?.includes(text));
  }

  it('renders the outline tree with group and path nodes', () => {
    mountTree();
    expect(target.querySelector('[role="tree"]')).toBeTruthy();
    expect(rowByText('Paths')).toBeTruthy();
    expect(rowByText('/b')).toBeTruthy();
    expect(rowByText('/a')).toBeTruthy();
  });

  it('shows the empty state when there is no analysis', () => {
    mountTree({ analysis: null });
    expect(target.querySelector('[role="tree"]')).toBeNull();
    expect(target.querySelector('[role="status"]')?.textContent).toContain('Open an OpenAPI document');
  });

  it('re-orders paths when sortAlphabetically flips', () => {
    const props = mountTree();
    const declaredOrder = rows().map((row) => row.textContent ?? '');
    expect(declaredOrder.findIndex((t) => t.includes('/b')))
      .toBeLessThan(declaredOrder.findIndex((t) => t.includes('/a')));

    props.sortAlphabetically = true;
    flushSync();
    const sortedOrder = rows().map((row) => row.textContent ?? '');
    expect(sortedOrder.findIndex((t) => t.includes('/a')))
      .toBeLessThan(sortedOrder.findIndex((t) => t.includes('/b')));
  });

  it('invokes onreveal with the pointer when a pointer-bearing row is clicked', () => {
    const props = mountTree();
    rowByText('/b')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    flushSync();
    expect(props.onreveal).toHaveBeenCalledWith('/paths/~1b');
  });

  function collapseViaChevron(row: HTMLElement): void {
    row.querySelector('.chevron-btn')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    flushSync();
  }

  it('toggles a pointer-less group row on click instead of revealing', () => {
    // The Tags group renders without a pointer when the spec declares no tags
    // (untagged operations still nest under it), so row-click toggles.
    const props = mountTree();
    const tagsRow = rowByText('Tags')!;
    expect(tagsRow.getAttribute('aria-expanded')).toBe('true');
    tagsRow.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    flushSync();
    expect(rowByText('Tags')!.getAttribute('aria-expanded')).toBe('false');
    expect(props.onreveal).not.toHaveBeenCalled();
  });

  it('collapses a pointer-bearing group via its chevron without revealing', () => {
    const props = mountTree();
    collapseViaChevron(rowByText('Paths')!);
    expect(rowByText('Paths')!.getAttribute('aria-expanded')).toBe('false');
    expect(rowByText('/b')).toBeUndefined();
    expect(props.onreveal).not.toHaveBeenCalled();
  });

  it('keeps explicit expansion state across a content-driven rebuild', () => {
    const props = mountTree();
    collapseViaChevron(rowByText('Paths')!);
    expect(rowByText('/b')).toBeUndefined();

    // New analysis object -> new OutlineNode objects with the same stable ids.
    props.analysis = analyzeOpenApi(YAML.replace('title: T', 'title: T2'), 'yaml');
    flushSync();
    expect(rowByText('Paths')!.getAttribute('aria-expanded')).toBe('false');
    expect(rowByText('/b')).toBeUndefined();
  });

  it('highlights the nearest indexed ancestor of the cursor pointer and expands to it', () => {
    const props = mountTree();
    // Deeper than any outline node -> nearest ancestor is the get operation.
    props.activePointer = '/paths/~1b/get/responses/200/description/deeper';
    flushSync();
    const selected = rows().filter((row) => row.getAttribute('aria-selected') === 'true');
    expect(selected.length).toBe(1);
    expect(selected[0].textContent).toContain('200');
  });

  it('clears expansion overrides when the document changes', () => {
    const props = mountTree();
    collapseViaChevron(rowByText('Paths')!);
    expect(rowByText('/b')).toBeUndefined();

    props.documentUri = '/tmp/other.yaml';
    flushSync();
    expect(rowByText('/b')).toBeTruthy();
  });
});
