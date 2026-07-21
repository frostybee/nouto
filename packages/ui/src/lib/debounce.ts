/**
 * Shared trailing-edge debounce. Replaces the ad-hoc
 * `clearTimeout(timer); timer = setTimeout(...)` pattern duplicated across
 * the codebase.
 */
export interface Debounced<Args extends unknown[]> {
  (...args: Args): void;
  /** Drops any pending invocation without running it. */
  cancel(): void;
  /** Runs any pending invocation immediately. */
  flush(): void;
}

export function debounce<Args extends unknown[]>(
  fn: (...args: Args) => void,
  delayMs: number
): Debounced<Args> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: Args | null = null;

  function invoke() {
    timer = null;
    if (pending) {
      const args = pending;
      pending = null;
      fn(...args);
    }
  }

  const debounced = ((...args: Args) => {
    pending = args;
    if (timer) clearTimeout(timer);
    timer = setTimeout(invoke, delayMs);
  }) as Debounced<Args>;

  debounced.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    pending = null;
  };

  debounced.flush = () => {
    if (timer) clearTimeout(timer);
    invoke();
  };

  return debounced;
}
