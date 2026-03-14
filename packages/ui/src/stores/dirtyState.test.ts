import { describe, it, expect, beforeEach } from 'vitest';
import { dirtyRequestIds, setDirtyRequestIds } from './dirtyState.svelte';

describe('dirtyState store', () => {
  beforeEach(() => {
    setDirtyRequestIds([]);
  });

  describe('initial state', () => {
    it('should start with an empty set', () => {
      const ids = dirtyRequestIds();
      expect(ids).toBeInstanceOf(Set);
      expect(ids.size).toBe(0);
    });
  });

  describe('setDirtyRequestIds', () => {
    it('should set dirty request IDs from an array', () => {
      setDirtyRequestIds(['req-1', 'req-2', 'req-3']);
      const ids = dirtyRequestIds();
      expect(ids.size).toBe(3);
      expect(ids.has('req-1')).toBe(true);
      expect(ids.has('req-2')).toBe(true);
      expect(ids.has('req-3')).toBe(true);
    });

    it('should deduplicate IDs', () => {
      setDirtyRequestIds(['req-1', 'req-1', 'req-2']);
      const ids = dirtyRequestIds();
      expect(ids.size).toBe(2);
    });

    it('should replace previous dirty IDs', () => {
      setDirtyRequestIds(['req-1', 'req-2']);
      setDirtyRequestIds(['req-3']);
      const ids = dirtyRequestIds();
      expect(ids.size).toBe(1);
      expect(ids.has('req-3')).toBe(true);
      expect(ids.has('req-1')).toBe(false);
    });

    it('should handle empty array', () => {
      setDirtyRequestIds(['req-1']);
      setDirtyRequestIds([]);
      expect(dirtyRequestIds().size).toBe(0);
    });
  });
});
