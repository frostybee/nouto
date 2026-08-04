import { describe, it, expect, beforeEach, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

const dialogMocks = vi.hoisted(() => ({ open: vi.fn(), save: vi.fn() }));
const fsMocks = vi.hoisted(() => ({ readTextFile: vi.fn(), writeTextFile: vi.fn() }));
const modalMocks = vi.hoisted(() => ({ showLocalSaveDiscardCancel: vi.fn() }));
const notificationMocks = vi.hoisted(() => ({ showNotification: vi.fn() }));

vi.mock('@tauri-apps/plugin-dialog', () => dialogMocks);
vi.mock('@tauri-apps/plugin-fs', () => fsMocks);
vi.mock('../../lib/modal-store.svelte', () => modalMocks);
vi.mock('@nouto/ui/stores/notifications.svelte', () => notificationMocks);
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn().mockResolvedValue([]) }));

import OpenApiDocTabStrip from './OpenApiDocTabStrip.svelte';
import {
  openSession,
  newSession,
  setContentFor,
  resetAllSessions,
  sessionList,
  activeSessionId,
  setActiveSessionId,
} from '../../lib/openapi/session.svelte';

const VALID_YAML = `openapi: 3.1.0\ninfo:\n  title: T\n  version: 1.0.0\npaths: {}\n`;

function flushAsync(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('OpenApiDocTabStrip', () => {
  let target: HTMLElement;
  let instance: ReturnType<typeof mount> | undefined;
  let disposed: string[];

  beforeEach(() => {
    vi.clearAllMocks();
    resetAllSessions();
    disposed = [];
    document.body.innerHTML = '';
    target = document.createElement('div');
    document.body.appendChild(target);
  });

  function mountStrip(): void {
    instance = mount(OpenApiDocTabStrip, {
      target,
      props: { ondisposesession: (id: string) => disposed.push(id) },
    });
    flushSync();
  }

  function tabs(): HTMLButtonElement[] {
    return [...target.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  }

  it('renders one tab per session with labels and active state', () => {
    openSession('C:\\specs\\api.yaml', VALID_YAML, 'yaml');
    newSession(VALID_YAML, 'yaml');
    mountStrip();

    const rendered = tabs();
    expect(rendered).toHaveLength(2);
    expect(rendered[0].textContent).toContain('api.yaml');
    expect(rendered[1].textContent).toContain('Untitled');
    expect(rendered[0].getAttribute('aria-selected')).toBe('false');
    expect(rendered[1].getAttribute('aria-selected')).toBe('true');
    // Roving tabindex: only the active tab is in the tab order.
    expect(rendered[1].tabIndex).toBe(0);
    expect(rendered[0].tabIndex).toBe(-1);
    unmount(instance!);
  });

  it('renders nothing with no sessions', () => {
    mountStrip();
    expect(target.querySelector('[role="tablist"]')).toBeNull();
    unmount(instance!);
  });

  it('click switches the active session', () => {
    const a = openSession('/specs/a.yaml', VALID_YAML, 'yaml');
    openSession('/specs/b.yaml', VALID_YAML, 'yaml');
    mountStrip();

    tabs()[0].click();
    flushSync();
    expect(activeSessionId()).toBe(a);
    expect(tabs()[0].getAttribute('aria-selected')).toBe('true');
    unmount(instance!);
  });

  it('closes a clean tab without prompting and disposes its model', async () => {
    const a = openSession('/specs/a.yaml', VALID_YAML, 'yaml');
    openSession('/specs/b.yaml', VALID_YAML, 'yaml');
    mountStrip();

    tabs()[0].querySelector<HTMLElement>('.tab-action')!.click();
    await flushAsync();
    flushSync();

    expect(modalMocks.showLocalSaveDiscardCancel).not.toHaveBeenCalled();
    expect(sessionList().map((s) => s.id)).not.toContain(a);
    expect(disposed).toEqual([a]);
    expect(tabs()).toHaveLength(1);
    unmount(instance!);
  });

  it('close on a dirty tab prompts; cancel keeps the tab', async () => {
    const a = openSession('/specs/a.yaml', VALID_YAML, 'yaml');
    setContentFor(a, VALID_YAML + '# edit\n');
    mountStrip();

    modalMocks.showLocalSaveDiscardCancel.mockResolvedValue('cancel');
    tabs()[0].querySelector<HTMLElement>('.tab-action')!.click();
    await flushAsync();
    flushSync();

    expect(modalMocks.showLocalSaveDiscardCancel).toHaveBeenCalledTimes(1);
    expect(sessionList().map((s) => s.id)).toContain(a);
    expect(disposed).toEqual([]);

    modalMocks.showLocalSaveDiscardCancel.mockResolvedValue('discard');
    tabs()[0].querySelector<HTMLElement>('.tab-action')!.click();
    await flushAsync();
    flushSync();
    expect(sessionList()).toHaveLength(0);
    expect(disposed).toEqual([a]);
    unmount(instance!);
  });

  it('middle-click closes with the same dirty confirmation', async () => {
    const a = openSession('/specs/a.yaml', VALID_YAML, 'yaml');
    setContentFor(a, VALID_YAML + '# edit\n');
    mountStrip();

    modalMocks.showLocalSaveDiscardCancel.mockResolvedValue('discard');
    tabs()[0].dispatchEvent(new MouseEvent('auxclick', { button: 1, bubbles: true }));
    await flushAsync();
    flushSync();

    expect(modalMocks.showLocalSaveDiscardCancel).toHaveBeenCalledTimes(1);
    expect(sessionList()).toHaveLength(0);
    expect(disposed).toEqual([a]);
    unmount(instance!);
  });

  it('shows the dirty dot on dirty tabs', () => {
    const a = openSession('/specs/a.yaml', VALID_YAML, 'yaml');
    mountStrip();
    expect(target.querySelector('.dirty-dot')).toBeNull();
    setContentFor(a, VALID_YAML + '# edit\n');
    flushSync();
    expect(target.querySelector('.dirty-dot')).not.toBeNull();
    unmount(instance!);
  });

  it('arrow keys move activation (ARIA tabs pattern)', async () => {
    const a = openSession('/specs/a.yaml', VALID_YAML, 'yaml');
    const b = openSession('/specs/b.yaml', VALID_YAML, 'yaml');
    setActiveSessionId(a);
    mountStrip();

    tabs()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await flushAsync();
    flushSync();
    expect(activeSessionId()).toBe(b);

    tabs()[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await flushAsync();
    flushSync();
    expect(activeSessionId()).toBe(a); // wraps around

    tabs()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    await flushAsync();
    flushSync();
    expect(activeSessionId()).toBe(b);
    unmount(instance!);
  });
});
