export interface JsonStats {
  totalKeys: number;
  totalArrays: number;
  totalObjects: number;
  maxDepth: number;
  types: {
    strings: number;
    numbers: number;
    booleans: number;
    nulls: number;
  };
}

export function computeJsonStats(value: unknown): JsonStats {
  const stats: JsonStats = {
    totalKeys: 0,
    totalArrays: 0,
    totalObjects: 0,
    maxDepth: 0,
    types: { strings: 0, numbers: 0, booleans: 0, nulls: 0 },
  };

  function traverse(val: unknown, depth: number): void {
    if (depth > stats.maxDepth) stats.maxDepth = depth;

    if (Array.isArray(val)) {
      stats.totalArrays++;
      for (const item of val) traverse(item, depth + 1);
    } else if (val !== null && typeof val === 'object') {
      stats.totalObjects++;
      const keys = Object.keys(val as Record<string, unknown>);
      stats.totalKeys += keys.length;
      for (const key of keys) traverse((val as Record<string, unknown>)[key], depth + 1);
    } else if (typeof val === 'string') {
      stats.types.strings++;
    } else if (typeof val === 'number') {
      stats.types.numbers++;
    } else if (typeof val === 'boolean') {
      stats.types.booleans++;
    } else if (val === null) {
      stats.types.nulls++;
    }
  }

  traverse(value, 0);
  return stats;
}
