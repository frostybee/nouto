import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import Tooltip from './Tooltip.svelte';
import { createRawSnippet } from 'svelte';

describe('Tooltip', () => {
  let target: HTMLElement;
  let instance: Record<string, unknown> | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    target = document.createElement('div');
    document.body.appendChild(target);
  });

  afterEach(() => {
    if (instance) unmount(instance);
    instance = undefined;
    target.remove();
    vi.useRealTimers();
  });

  function mountTooltip(delay = 150) {
    const children = createRawSnippet(() => ({ render: () => '<button type="button">Trigger</button>' }));
    instance = mount(Tooltip, { target, props: { text: 'Hint', delay, children } });
    flushSync();
    return target.querySelector<HTMLElement>('.tooltip-wrapper')!;
  }

  function fire(el: HTMLElement, type: string) {
    el.dispatchEvent(new Event(type, { bubbles: true }));
    flushSync();
  }

  const tooltip = () => target.querySelector('[role="tooltip"]');

  it('shows after the delay and hides on leave', () => {
    const wrapper = mountTooltip();
    fire(wrapper, 'mouseenter');
    expect(tooltip()).toBeNull();
    vi.advanceTimersByTime(150);
    flushSync();
    expect(tooltip()?.textContent).toContain('Hint');
    fire(wrapper, 'mouseleave');
    expect(tooltip()).toBeNull();
  });

  it('does not stick open after a hover followed by a focus and a leave', () => {
    const wrapper = mountTooltip();
    // Hover, then click: mouseenter and focusin arrive within the delay.
    fire(wrapper, 'mouseenter');
    vi.advanceTimersByTime(50);
    fire(wrapper, 'focusin');
    // The pointer leaves before either timer fires.
    fire(wrapper, 'mouseleave');
    vi.advanceTimersByTime(1000);
    flushSync();
    expect(tooltip()).toBeNull();
  });

  it('clears a pending timer on unmount', () => {
    const wrapper = mountTooltip();
    fire(wrapper, 'mouseenter');
    unmount(instance!);
    instance = undefined;
    expect(() => vi.advanceTimersByTime(1000)).not.toThrow();
    expect(tooltip()).toBeNull();
  });
});
