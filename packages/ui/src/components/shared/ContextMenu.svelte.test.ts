import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';
import ContextMenu from './ContextMenu.svelte';
import type { ContextMenuItem } from './ContextMenu.svelte';

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

function toRect({ left, top, width, height }: Box): DOMRect {
  return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) } as DOMRect;
}

describe('ContextMenu', () => {
  let target: HTMLElement;
  let instance: Record<string, unknown> | undefined;
  let actions: { http: Mock; grpc: Mock; folder: Mock };
  // jsdom has no layout, so getBoundingClientRect reports these boxes instead.
  let boxes: { menu: Box; submenu: Box; anchorTop: number };

  beforeEach(() => {
    target = document.createElement('div');
    document.body.appendChild(target);
    Object.assign(window, { innerWidth: 1000, innerHeight: 600 });
    actions = { http: vi.fn(), grpc: vi.fn(), folder: vi.fn() };
    boxes = {
      menu: { left: 100, top: 100, width: 200, height: 300 },
      submenu: { left: 0, top: 0, width: 180, height: 150 },
      anchorTop: 120,
    };
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      if (this.classList.contains('context-submenu')) return toRect(boxes.submenu);
      if (this.classList.contains('context-menu')) return toRect(boxes.menu);
      return toRect({ left: boxes.menu.left, top: boxes.anchorTop, width: boxes.menu.width, height: 24 });
    });
  });

  afterEach(() => {
    if (instance) unmount(instance);
    instance = undefined;
    target.remove();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function items(): ContextMenuItem[] {
    return [
      {
        label: 'New Request',
        icon: 'codicon-add',
        children: [
          { label: 'HTTP', action: actions.http },
          { label: 'gRPC', action: actions.grpc },
        ],
      },
      { label: 'New Folder', action: actions.folder },
    ];
  }

  function mountMenu(props: Record<string, unknown> = {}) {
    const onclose = vi.fn();
    instance = mount(ContextMenu, { target, props: { items: items(), x: 100, y: 100, show: true, onclose, ...props } });
    flushSync();
    return { onclose };
  }

  const mainMenu = () => target.querySelector<HTMLElement>('.context-menu:not(.context-submenu)')!;
  const submenu = () => target.querySelector<HTMLElement>('.context-submenu');
  const mainItems = () => [...mainMenu().querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
  const subItems = () => [...(submenu()?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])];

  function press(key: string) {
    (document.activeElement as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    flushSync();
  }

  function hover(el: HTMLElement) {
    el.dispatchEvent(new MouseEvent('mouseenter'));
    flushSync();
  }

  async function settle() {
    await tick();
    await tick();
    flushSync();
  }

  it('marks items with children as submenu parents', () => {
    mountMenu();
    const [parent, folder] = mainItems();
    expect(parent.getAttribute('aria-haspopup')).toBe('menu');
    expect(parent.getAttribute('aria-expanded')).toBe('false');
    expect(parent.querySelector('.context-chevron')).not.toBeNull();
    expect(folder.hasAttribute('aria-haspopup')).toBe(false);
    expect(submenu()).toBeNull();
  });

  it('opens the submenu on click without closing the menu', () => {
    const { onclose } = mountMenu();
    mainItems()[0].click();
    flushSync();
    expect(subItems().map(b => b.textContent?.trim())).toEqual(['HTTP', 'gRPC']);
    expect(submenu()!.getAttribute('aria-label')).toBe('New Request');
    expect(mainItems()[0].getAttribute('aria-expanded')).toBe('true');
    expect(onclose).not.toHaveBeenCalled();
  });

  it('runs a submenu action and closes the menu', () => {
    const { onclose } = mountMenu();
    mainItems()[0].click();
    flushSync();
    subItems()[1].click();
    expect(actions.grpc).toHaveBeenCalledTimes(1);
    expect(actions.http).not.toHaveBeenCalled();
    expect(onclose).toHaveBeenCalledTimes(1);
  });

  it('moves focus into and out of the submenu with the arrow keys', async () => {
    mountMenu();
    mainItems()[0].focus();
    press('ArrowRight');
    await settle();
    expect(document.activeElement).toBe(subItems()[0]);

    press('ArrowDown');
    expect(document.activeElement).toBe(subItems()[1]);

    press('ArrowLeft');
    expect(submenu()).toBeNull();
    expect(document.activeElement).toBe(mainItems()[0]);
  });

  it('closes only the submenu on Escape', async () => {
    const { onclose } = mountMenu();
    mainItems()[0].focus();
    press('Enter');
    await settle();
    expect(document.activeElement).toBe(subItems()[0]);

    press('Escape');
    expect(submenu()).toBeNull();
    expect(onclose).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(mainItems()[0]);
  });

  it('runs the focused submenu item on Enter', async () => {
    const { onclose } = mountMenu();
    mainItems()[0].focus();
    press('ArrowRight');
    await settle();
    press('Enter');
    expect(actions.http).toHaveBeenCalledTimes(1);
    expect(onclose).toHaveBeenCalledTimes(1);
  });

  it('keeps the menu inside the viewport', () => {
    mountMenu({ x: 950, y: 500 });
    expect(mainMenu().style.left).toBe('796px');
    expect(mainMenu().style.top).toBe('296px');
  });

  it('pins a menu taller than the viewport to the top edge', () => {
    boxes.menu.height = 700;
    mountMenu({ y: 300 });
    expect(mainMenu().style.top).toBe('4px');
  });

  describe('submenu placement', () => {
    function openFirstSubmenu() {
      mountMenu();
      mainItems()[0].click();
      flushSync();
      return submenu()!;
    }

    it('opens to the right of the parent menu when it fits', () => {
      const el = openFirstSubmenu();
      expect(el.style.left).toBe('298px');
      expect(el.style.top).toBe('120px');
    });

    it('flips to the left when the right side has no room', () => {
      boxes.menu.left = 750;
      const el = openFirstSubmenu();
      expect(el.style.left).toBe('572px');
    });

    it('shifts up when the parent item is near the bottom', () => {
      boxes.anchorTop = 550;
      const el = openFirstSubmenu();
      expect(el.style.top).toBe('446px');
    });
  });

  describe('drill-in when neither side has room', () => {
    const backRow = () => mainMenu().querySelector<HTMLButtonElement>('.context-back');
    const childItems = () => [...mainMenu().querySelectorAll<HTMLButtonElement>('[role="menuitem"][data-index]')];

    beforeEach(() => {
      Object.assign(window, { innerWidth: 300 });
      boxes.menu.left = 50;
    });

    it('shows the submenu inside the main menu on click', async () => {
      const { onclose } = mountMenu();
      mainItems()[0].click();
      await settle();
      expect(submenu()).toBeNull();
      expect(backRow()?.textContent?.trim()).toBe('New Request');
      expect(childItems().map(b => b.textContent?.trim())).toEqual(['HTTP', 'gRPC']);
      expect(mainMenu().getAttribute('aria-label')).toBe('New Request');
      expect(document.activeElement).toBe(mainMenu());
      expect(onclose).not.toHaveBeenCalled();
    });

    it('returns to the main list from the back row', async () => {
      mountMenu();
      mainItems()[0].click();
      await settle();
      backRow()!.click();
      flushSync();
      expect(backRow()).toBeNull();
      expect(mainItems().map(b => b.textContent?.trim())).toEqual(['New Request', 'New Folder']);
      expect(document.activeElement).toBe(mainItems()[0]);
    });

    it('navigates the drilled-in list with the keyboard', async () => {
      const { onclose } = mountMenu();
      mainItems()[0].focus();
      press('Enter');
      await settle();
      expect(document.activeElement).toBe(childItems()[0]);

      press('ArrowDown');
      expect(document.activeElement).toBe(childItems()[1]);

      press('Escape');
      expect(backRow()).toBeNull();
      expect(onclose).not.toHaveBeenCalled();
      expect(document.activeElement).toBe(mainItems()[0]);
    });

    it('runs a drilled-in action and closes the menu', async () => {
      const { onclose } = mountMenu();
      mainItems()[0].click();
      await settle();
      childItems()[1].click();
      expect(actions.grpc).toHaveBeenCalledTimes(1);
      expect(onclose).toHaveBeenCalledTimes(1);
    });

    it('does not drill in on hover', () => {
      mountMenu();
      hover(mainItems()[0]);
      expect(backRow()).toBeNull();
      expect(submenu()).toBeNull();
    });

    it('drills in when the submenu turns out wider than the estimate', async () => {
      Object.assign(window, { innerWidth: 700 });
      boxes.menu.left = 260;
      boxes.submenu.width = 300;
      mountMenu();
      mainItems()[0].click();
      await settle();
      expect(submenu()).toBeNull();
      expect(backRow()).not.toBeNull();
    });
  });

  it('closes a hovered submenu after a grace period unless the pointer reaches it', () => {
    vi.useFakeTimers();
    mountMenu();
    const [parent, folder] = mainItems();
    hover(parent);
    expect(submenu()).not.toBeNull();

    hover(folder);
    hover(submenu()!);
    vi.advanceTimersByTime(300);
    flushSync();
    expect(submenu()).not.toBeNull();

    hover(folder);
    vi.advanceTimersByTime(300);
    flushSync();
    expect(submenu()).toBeNull();
  });
});
