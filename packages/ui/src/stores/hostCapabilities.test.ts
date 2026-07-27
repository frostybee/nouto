import { describe, it, expect, beforeEach } from 'vitest';
import { hostCapabilities, setCanEditOpenApiSpec } from './hostCapabilities.svelte';

describe('hostCapabilities store', () => {
  beforeEach(() => {
    setCanEditOpenApiSpec(false);
  });

  it('defaults to no spec-editing capability (desktop-safe default)', () => {
    expect(hostCapabilities.canEditOpenApiSpec).toBe(false);
  });

  it('can be enabled by a host bootstrap', () => {
    setCanEditOpenApiSpec(true);
    expect(hostCapabilities.canEditOpenApiSpec).toBe(true);
  });

  it('can be disabled again', () => {
    setCanEditOpenApiSpec(true);
    setCanEditOpenApiSpec(false);
    expect(hostCapabilities.canEditOpenApiSpec).toBe(false);
  });
});
