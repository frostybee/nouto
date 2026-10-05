import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import SidebarToolbar from './SidebarToolbar.svelte';

describe('SidebarToolbar', () => {
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
    vi.useRealTimers();
  });

  function mountToolbar(props: Record<string, unknown> = {}) {
    const onselect = vi.fn();
    instance = mount(SidebarToolbar, {
      target,
      props: { activePanel: null, hasNoEnv: false, cookieCount: 0, onselect, ...props },
    });
    flushSync();
    return { onselect };
  }

  const buttons = () => [...target.querySelectorAll<HTMLButtonElement>('[role="toolbar"] button')];
  const button = (label: string) => target.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;

  function tooltipFor(label: string): string | undefined {
    vi.useFakeTimers();
    button(label).closest('.tooltip-wrapper')!.dispatchEvent(new MouseEvent('mouseenter'));
    vi.advanceTimersByTime(200);
    flushSync();
    return target.querySelector('[role="tooltip"]')?.textContent?.trim();
  }

  it('renders the panel buttons in order, without About', () => {
    mountToolbar();
    expect(buttons().map(b => b.getAttribute('aria-label'))).toEqual([
      'Environments',
      'Cookie Jars',
      'Mock Server',
      'Settings',
    ]);
  });

  it('marks the active panel as pressed', () => {
    mountToolbar({ activePanel: 'mockServer' });
    const pressed = buttons().filter(b => b.getAttribute('aria-pressed') === 'true');
    expect(pressed.map(b => b.getAttribute('aria-label'))).toEqual(['Mock Server']);
    expect(button('Mock Server').classList.contains('active')).toBe(true);
    expect(button('Settings').getAttribute('aria-pressed')).toBe('false');
  });

  it('reports the clicked panel', () => {
    const { onselect } = mountToolbar();
    for (const label of ['Environments', 'Cookie Jars', 'Mock Server', 'Settings']) {
      button(label).click();
    }
    expect(onselect.mock.calls.map(([panel]) => panel)).toEqual(['environments', 'cookieJar', 'mockServer', 'settings']);
  });

  it('shows the warning dot only when no environment is selected', () => {
    mountToolbar({ hasNoEnv: true });
    expect(button('Environments').querySelector('.action-badge-warning')).not.toBeNull();
    unmount(instance!);
    mountToolbar({ hasNoEnv: false });
    expect(button('Environments').querySelector('.action-badge-warning')).toBeNull();
  });

  it.each([
    [0, null],
    [3, '3'],
    [12, '9+'],
  ])('shows a cookie badge for %i cookies', (cookieCount, expected) => {
    mountToolbar({ cookieCount });
    const badge = button('Cookie Jars').querySelector('.action-badge-info');
    expect(badge?.textContent ?? null).toBe(expected);
  });

  it('names the active environment in the tooltip', () => {
    mountToolbar({ activeEnvironmentName: 'Staging' });
    expect(tooltipFor('Environments')).toBe('Environment: Staging');
  });

  it('falls back to a generic environments tooltip', () => {
    mountToolbar();
    expect(tooltipFor('Environments')).toBe('Environments');
  });

  it('counts cookies in the cookie jar tooltip', () => {
    mountToolbar({ cookieCount: 4 });
    expect(tooltipFor('Cookie Jars')).toBe('Cookie Jars (4 cookies)');
  });
});
