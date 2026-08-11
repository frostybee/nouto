import { describe, it, expect, beforeEach } from 'vitest';
import { hostCapabilities, setCanEditOpenApiSpec, setJsonExplorerOpensInPlace } from './hostCapabilities.svelte';

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

describe('jsonExplorerOpensInPlace capability', () => {
  beforeEach(() => {
    setJsonExplorerOpensInPlace(false);
  });

  it('defaults to new-tab behavior (VS Code-safe default)', () => {
    expect(hostCapabilities.jsonExplorerOpensInPlace).toBe(false);
  });

  it('can be enabled by a host bootstrap', () => {
    setJsonExplorerOpensInPlace(true);
    expect(hostCapabilities.jsonExplorerOpensInPlace).toBe(true);
  });

  it('can be disabled again', () => {
    setJsonExplorerOpensInPlace(true);
    setJsonExplorerOpensInPlace(false);
    expect(hostCapabilities.jsonExplorerOpensInPlace).toBe(false);
  });
});
