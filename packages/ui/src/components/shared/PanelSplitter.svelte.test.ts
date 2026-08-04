import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import PanelSplitter from './PanelSplitter.svelte';

const storeMocks = vi.hoisted(() => ({
  setPanelSplitRatio: vi.fn(),
  setSidebarSplitRatio: vi.fn(),
  toggleSidebar: vi.fn(),
  ui: { sidebarCollapsed: false },
}));
vi.mock('../../stores/ui.svelte', () => storeMocks);

describe('PanelSplitter', () => {
  let target: HTMLElement;
  let instance: Record<string, unknown> | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    target = document.createElement('div');
    document.body.appendChild(target);
    // jsdom reports zero-sized rects; give the drag math a real box.
    target.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 200, height: 200, right: 200, bottom: 200, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  });

  afterEach(() => {
    if (instance) unmount(instance);
    instance = undefined;
    target.remove();
  });

  function mountSplitter(props: Record<string, unknown>) {
    instance = mount(PanelSplitter, { target, props: { orientation: 'horizontal', ...props } });
    flushSync();
    return target.querySelector<HTMLElement>('.splitter')!;
  }

  // The shared test setup replaces `window` with a stub whose
  // addEventListener is a vi.fn(), so drags are simulated by invoking the
  // handlers the splitter registered on mousedown.
  function windowHandler(type: string): (event: MouseEvent) => void {
    const calls = (window.addEventListener as unknown as ReturnType<typeof vi.fn>).mock.calls;
    const call = [...calls].reverse().find(([eventType]) => eventType === type);
    expect(call, `no window ${type} listener registered`).toBeTruthy();
    return call![1] as (event: MouseEvent) => void;
  }

  function drag(splitter: HTMLElement, clientX: number): void {
    splitter.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 0 }));
    windowHandler('mousemove')(new MouseEvent('mousemove', { clientX }));
    windowHandler('mouseup')(new MouseEvent('mouseup'));
  }

  describe("target='controlled'", () => {
    it('reports the drag ratio through onRatioChange without touching the ui store', () => {
      const onRatioChange = vi.fn();
      const splitter = mountSplitter({
        target: 'controlled',
        onRatioChange,
        minRatio: 0.15,
        maxRatio: 0.6,
      });
      drag(splitter, 100);
      expect(onRatioChange).toHaveBeenCalledWith(0.5);
      expect(storeMocks.setPanelSplitRatio).not.toHaveBeenCalled();
      expect(storeMocks.setSidebarSplitRatio).not.toHaveBeenCalled();
    });

    it('clamps the reported ratio to [minRatio, maxRatio]', () => {
      const onRatioChange = vi.fn();
      const splitter = mountSplitter({
        target: 'controlled',
        onRatioChange,
        minRatio: 0.15,
        maxRatio: 0.6,
      });
      drag(splitter, 4); // 0.02 -> clamped up
      expect(onRatioChange).toHaveBeenLastCalledWith(0.15);
      drag(splitter, 196); // 0.98 -> clamped down
      expect(onRatioChange).toHaveBeenLastCalledWith(0.6);
    });

    it('resets to defaultRatio on double-click', () => {
      const onRatioChange = vi.fn();
      const splitter = mountSplitter({
        target: 'controlled',
        onRatioChange,
        defaultRatio: 0.3,
      });
      splitter.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      expect(onRatioChange).toHaveBeenCalledWith(0.3);
      expect(storeMocks.setPanelSplitRatio).not.toHaveBeenCalled();
    });
  });

  describe('existing targets (regression)', () => {
    it("target='panel' still writes to the ui store on drag", () => {
      const splitter = mountSplitter({ target: 'panel' });
      drag(splitter, 100);
      expect(storeMocks.setPanelSplitRatio).toHaveBeenCalledWith(0.5);
    });

    it("target='panel' still resets to 0.5 on double-click", () => {
      const splitter = mountSplitter({ target: 'panel' });
      splitter.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      expect(storeMocks.setPanelSplitRatio).toHaveBeenCalledWith(0.5);
    });

    it("target='sidebar' still writes to the ui store on drag", () => {
      const splitter = mountSplitter({ target: 'sidebar' });
      // Past minPixelWidth (180px of the 200px parent), so no collapse branch.
      drag(splitter, 190);
      expect(storeMocks.setSidebarSplitRatio).toHaveBeenCalledWith(0.95);
    });
  });
});
