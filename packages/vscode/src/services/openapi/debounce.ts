export interface Debounced<Args extends unknown[]> {
  (...args: Args): void;
  cancel(): void;
  flush(): void;
}

/** Local copy of the UI trailing-edge debounce; a core hoist can follow later. */
export function debounce<Args extends unknown[]>(
  fn: (...args: Args) => void,
  delayMs: number
): Debounced<Args> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: Args | null = null;

  function invoke(): void {
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
