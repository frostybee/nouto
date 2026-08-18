import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { analyzeOpenApi } from '@nouto/core/services/openapi/analyze';
import type { ExternalAnalysisResult } from '@nouto/core/services/openapi/externalRefs';
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
  sessionId?: string;
  content?: string;
  format?: 'yaml' | 'json';
  sortAlphabetically: boolean;
  external?: ExternalAnalysisResult | null;
  activePointer?: string;
  onreveal: (pointer: string, documentUri?: string) => void;
  onrevealoffset?: (offset: number) => void;
  ontryit?: (operation: { path: string; method: string }) => void;
  hasErrors?: boolean;
  oncontextaction?: (node: unknown, id: string, payload?: Record<string, unknown>) => void;
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
    const status = target.querySelector('[role="status"]');
    expect(status?.textContent).toContain('Open an OpenAPI document');
    expect(status?.getAttribute('aria-live')).toBe('polite');
  });

  it('exposes aria-level/posinset/setsize on tree items (a11y pass)', () => {
    mountTree();
    const roots = rows().filter((row) => row.getAttribute('aria-level') === '1');
    expect(roots.length).toBeGreaterThan(0);
    expect(roots[0].getAttribute('aria-posinset')).toBe('1');
    expect(roots[0].getAttribute('aria-setsize')).toBe(String(roots.length));
    const pathRow = rowByText('/b')!;
    expect(pathRow.getAttribute('aria-level')).toBe('2');
    expect(pathRow.getAttribute('aria-setsize')).toBe('2');
  });

  it('re-orders paths when sortAlphabetically flips', () => {
    const props = mountTree();
    const declaredOrder = rows().map((row) => row.textContent ?? '');
    expect(declaredOrder.findIndex((t) => t.includes('/b'))).toBeLessThan(
      declaredOrder.findIndex((t) => t.includes('/a')),
    );

    props.sortAlphabetically = true;
    flushSync();
    const sortedOrder = rows().map((row) => row.textContent ?? '');
    expect(sortedOrder.findIndex((t) => t.includes('/a'))).toBeLessThan(
      sortedOrder.findIndex((t) => t.includes('/b')),
    );
  });

  it('invokes onreveal with the pointer when a pointer-bearing row is clicked', () => {
    const props = mountTree();
    rowByText('/b')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    flushSync();
    const calls = (props.onreveal as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe('/paths/~1b');
  });

  describe('external "Referenced files" group (Phase 5)', () => {
    const TARGET_URI = 'file:///C:/specs/common.yaml';

    function externalFixture(resolved = true): ExternalAnalysisResult {
      return {
        diagnostics: [],
        externalRefs: new Map([
          [
            '/components/schemas/Pet/$ref',
            {
              ref: './common.yaml#/components/schemas/Pet',
              atPointer: '/components/schemas/Pet/$ref',
              targetUri: TARGET_URI,
              targetPointer: '/components/schemas/Pet',
            },
          ],
        ]),
        resolvedFiles: resolved ? new Map([[TARGET_URI, { parsed: {} }]]) : new Map(),
        referencedFiles: new Set([TARGET_URI]),
      };
    }

    it('renders the group with a relative file label and ref count', () => {
      mountTree({ documentUri: 'file:///C:/specs/api.yaml', external: externalFixture() });
      expect(rowByText('Referenced files')).toBeTruthy();
      const fileRow = rowByText('common.yaml');
      expect(fileRow).toBeTruthy();
      expect(fileRow!.textContent).toContain('1 ref');
    });

    it('omits the group entirely when external analysis has no refs', () => {
      mountTree({
        documentUri: 'file:///C:/specs/api.yaml',
        external: {
          diagnostics: [],
          externalRefs: new Map(),
          resolvedFiles: new Map(),
          referencedFiles: new Set(),
        },
      });
      expect(rowByText('Referenced files')).toBeUndefined();
    });

    it('clicking an external pointer node reveals with the target document URI', () => {
      const props = mountTree({
        documentUri: 'file:///C:/specs/api.yaml',
        external: externalFixture(),
      });
      // File nodes start collapsed (depth 1) — expand to reach the pointer node.
      rowByText('common.yaml')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      flushSync();
      const pointerRow = rowByText('/components/schemas/Pet');
      expect(pointerRow).toBeTruthy();
      pointerRow!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      flushSync();
      expect(props.onreveal).toHaveBeenCalledWith('/components/schemas/Pet', TARGET_URI);
    });
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

  describe('Try It action', () => {
    function expandPath(row: HTMLElement): void {
      row.querySelector('.chevron-btn')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      flushSync();
    }

    it('renders the Try It button on operation rows only', () => {
      mountTree({ ontryit: vi.fn() });
      expandPath(rowByText('/b')!);
      const operationRow = rows().find((row) => row.querySelector('.tryit-btn'));
      expect(operationRow).toBeTruthy();
      expect(operationRow!.textContent).toContain('GET');
      // The path row itself carries no operation and thus no button.
      expect(rowByText('/b')!.querySelector('.tryit-btn')).toBeNull();
    });

    it('fires ontryit with the operation coordinates without revealing', () => {
      const ontryit = vi.fn();
      const props = mountTree({ ontryit });
      expandPath(rowByText('/b')!);
      const button = target.querySelector<HTMLElement>('.tryit-btn')!;
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      flushSync();
      expect(ontryit).toHaveBeenCalledWith({ path: '/b', method: 'get' });
      expect(props.onreveal).not.toHaveBeenCalled();
    });

    it('renders no Try It buttons when the callback is not provided', () => {
      mountTree();
      expandPath(rowByText('/b')!);
      expect(target.querySelector('.tryit-btn')).toBeNull();
    });
  });

  it('clears expansion overrides when the document changes', () => {
    const props = mountTree();
    collapseViaChevron(rowByText('Paths')!);
    expect(rowByText('/b')).toBeUndefined();

    props.documentUri = '/tmp/other.yaml';
    flushSync();
    expect(rowByText('/b')).toBeTruthy();
  });

  describe('parse failures', () => {
    // A value glued to a quoted key: the YAML parser rejects it.
    const BROKEN_YAML = YAML.replace(
      "        '200':\n          description: OK\n  /a:",
      "        '200':dad\n          description: OK\n  /a:",
    );
    const brokenLine = BROKEN_YAML.split('\n').findIndex((line) => line.includes("'200':dad")) + 1;

    function statusText(): string | undefined {
      const banner = target.querySelector<HTMLElement>('.outline-error');
      if (!banner) return undefined;
      const title = banner.querySelector('.outline-error-title')?.textContent?.trim();
      const detail = banner.querySelector('.outline-error-detail')?.textContent?.trim();
      return `${title}: ${detail}`;
    }

    it('explains a document that never parsed instead of the generic empty state', () => {
      expect(brokenLine).toBeGreaterThan(0);
      mountTree({
        analysis: analyzeOpenApi(BROKEN_YAML, 'yaml'),
        content: BROKEN_YAML,
        format: 'yaml',
      });
      expect(target.querySelector('[role="tree"]')).toBeNull();
      expect(target.querySelector('.outline-empty')).toBeNull();
      expect(statusText()).toMatch(new RegExp(`^Can't build the outline: line ${brokenLine}: `));
    });

    it('keeps the last good tree and marks it out of date when an edit breaks the parse', () => {
      const props = mountTree({ content: YAML, format: 'yaml', sessionId: 'doc-1' });
      expect(rowByText('/b')).toBeTruthy();
      expect(statusText()).toBeUndefined();

      props.analysis = analyzeOpenApi(BROKEN_YAML, 'yaml');
      props.content = BROKEN_YAML;
      flushSync();
      expect(rowByText('/b')).toBeTruthy();
      expect(statusText()).toMatch(new RegExp(`^Outline is out of date: line ${brokenLine}: `));

      props.analysis = analyzeOpenApi(YAML, 'yaml');
      props.content = YAML;
      flushSync();
      expect(rowByText('/b')).toBeTruthy();
      expect(statusText()).toBeUndefined();
    });

    it('renders as an error and jumps to the offending offset on click', () => {
      const onrevealoffset = vi.fn();
      mountTree({
        analysis: analyzeOpenApi(BROKEN_YAML, 'yaml'),
        content: BROKEN_YAML,
        format: 'yaml',
        onrevealoffset,
      });
      const banner = target.querySelector<HTMLElement>('.outline-error')!;
      expect(banner.getAttribute('role')).toBe('alert');
      expect(banner.querySelector('.codicon-error')).toBeTruthy();
      const link = banner.querySelector<HTMLButtonElement>('button.outline-error-link')!;
      expect(link).toBeTruthy();
      link.click();
      expect(onrevealoffset).toHaveBeenCalledTimes(1);
      const [offset] = onrevealoffset.mock.calls[0] as [number];
      expect(BROKEN_YAML.slice(0, offset).split('\n').length).toBe(brokenLine);
    });

    it('does not carry a tree over to a different session that fails to parse', () => {
      const props = mountTree({ content: YAML, format: 'yaml', sessionId: 'doc-1' });
      expect(rowByText('/b')).toBeTruthy();

      props.sessionId = 'doc-2';
      props.documentUri = '/tmp/other.yaml';
      props.analysis = analyzeOpenApi(BROKEN_YAML, 'yaml');
      props.content = BROKEN_YAML;
      flushSync();
      expect(target.querySelector('[role="tree"]')).toBeNull();
      expect(statusText()).toMatch(/^Can't build the outline: line \d+: /);
    });
  });

  describe('context menu (Phase 4)', () => {
    function openMenuOn(row: HTMLElement): void {
      row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 10, clientY: 10 }));
      flushSync();
    }

    function menuItems(): HTMLButtonElement[] {
      return [...target.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
    }

    function menuItem(label: string): HTMLButtonElement | undefined {
      return menuItems().find((button) => button.textContent?.includes(label));
    }

    it('opens a menu with Add Path and Copy JSON Pointer on the Paths group', () => {
      mountTree({ oncontextaction: vi.fn() });
      openMenuOn(rowByText('Paths')!);
      expect(menuItem('Add Path')).toBeTruthy();
      expect(menuItem('Copy JSON Pointer')).toBeTruthy();
    });

    it('fires oncontextaction and closes when an add entry is clicked', () => {
      const oncontextaction = vi.fn();
      mountTree({ oncontextaction });
      openMenuOn(rowByText('Paths')!);
      menuItem('Add Path')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      flushSync();
      expect(oncontextaction).toHaveBeenCalledTimes(1);
      const [node, id, payload] = oncontextaction.mock.calls[0];
      expect((node as { pointer?: string }).pointer).toBe('/paths');
      expect(id).toBe('addPath');
      expect(payload).toBeUndefined();
      expect(menuItems()).toEqual([]);
    });

    it('offers only unused methods on a path row, with the method payload', () => {
      const oncontextaction = vi.fn();
      mountTree({ oncontextaction });
      openMenuOn(rowByText('/b')!); // has get
      expect(menuItem('Add GET Operation')).toBeUndefined();
      const post = menuItem('Add POST Operation')!;
      post.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      flushSync();
      expect(oncontextaction).toHaveBeenCalledWith(
        expect.objectContaining({ pointer: '/paths/~1b' }),
        'addOperation',
        { method: 'post' },
      );
    });

    it('fires a danger delete entry for a path row', () => {
      const oncontextaction = vi.fn();
      mountTree({ oncontextaction });
      openMenuOn(rowByText('/b')!);
      const del = menuItem('Delete Path')!;
      expect(del.classList.contains('danger')).toBe(true);
      del.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      flushSync();
      expect(oncontextaction).toHaveBeenCalledWith(
        expect.objectContaining({ pointer: '/paths/~1b' }),
        'delete',
        undefined,
      );
    });

    it('disables edit entries but not Copy JSON Pointer while hasErrors', () => {
      mountTree({ oncontextaction: vi.fn(), hasErrors: true });
      openMenuOn(rowByText('/b')!);
      expect(menuItem('Add POST Operation')!.disabled).toBe(true);
      expect(menuItem('Delete Path')!.disabled).toBe(true);
      expect(menuItem('Copy JSON Pointer')!.disabled).toBe(false);
    });

    it('copies the JSON Pointer to the clipboard', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText },
        configurable: true,
      });
      mountTree({ oncontextaction: vi.fn() });
      openMenuOn(rowByText('/b')!);
      menuItem('Copy JSON Pointer')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      flushSync();
      await Promise.resolve();
      expect(writeText).toHaveBeenCalledWith('/paths/~1b');
    });

    it('runs Try It from an operation row menu', () => {
      const ontryit = vi.fn();
      mountTree({ ontryit, oncontextaction: vi.fn() });
      rowByText('/b')!
        .querySelector('.chevron-btn')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
      flushSync();
      const operationRow = rows().find((row) => row.textContent?.includes('GET'))!;
      openMenuOn(operationRow);
      menuItem('Try It')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      flushSync();
      expect(ontryit).toHaveBeenCalledWith({ path: '/b', method: 'get' });
    });

    it('shows only Copy JSON Pointer on plain info value rows', () => {
      mountTree({ oncontextaction: vi.fn() });
      // Top-level groups start expanded, so the general items are visible.
      const openapiRow = rows().find((row) => row.textContent?.includes('openapi'))!;
      expect(openapiRow).toBeTruthy();
      openMenuOn(openapiRow);
      expect(menuItems().map((button) => button.textContent?.trim())).toEqual([
        'Copy JSON Pointer',
      ]);
    });

    it('opening a second menu closes the first (broadcast)', () => {
      mountTree({ oncontextaction: vi.fn() });
      openMenuOn(rowByText('Paths')!);
      expect(menuItem('Add Path')).toBeTruthy();
      openMenuOn(rowByText('/b')!);
      expect(menuItem('Add Path')).toBeUndefined();
      expect(menuItem('Delete Path')).toBeTruthy();
    });
  });
});
