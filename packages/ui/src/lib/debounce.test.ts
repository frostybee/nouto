import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { debounce } from './debounce';

describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('invokes only once after the delay, with the latest arguments', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced('first');
    vi.advanceTimersByTime(50);
    debounced('second');
    vi.advanceTimersByTime(50);
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('second');
  });

  it('resets the timer on each call', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    for (let i = 0; i < 5; i++) {
      debounced(i);
      vi.advanceTimersByTime(99);
    }
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(4);
  });

  it('passes through multiple arguments', () => {
    const fn = vi.fn();
    const debounced = debounce<[string, number]>(fn, 10);
    debounced('x', 42);
    vi.advanceTimersByTime(10);
    expect(fn).toHaveBeenCalledWith('x', 42);
  });

  it('cancel() drops the pending invocation', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);
    debounced('x');
    debounced.cancel();
    vi.advanceTimersByTime(200);
    expect(fn).not.toHaveBeenCalled();
  });

  it('flush() runs the pending invocation immediately', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);
    debounced('x');
    debounced.flush();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('x');
    // No second invocation later
    vi.advanceTimersByTime(200);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('flush() is a no-op when nothing is pending', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);
    debounced.flush();
    expect(fn).not.toHaveBeenCalled();
  });

  it('can be reused after cancel and flush', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);
    debounced('a');
    debounced.cancel();
    debounced('b');
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('b');
  });
});
