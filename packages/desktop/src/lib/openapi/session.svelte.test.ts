import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { openApiSession, setContent, loadDocument, markSaved, resetSession } from './session.svelte';

const VALID_YAML = `openapi: 3.1.0\ninfo:\n  title: T\n  version: 1.0.0\npaths: {}\n`;

describe('openApiSession', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetSession();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts empty and clean', () => {
    expect(openApiSession.documentUri).toBeNull();
    expect(openApiSession.format).toBeNull();
    expect(openApiSession.dirty).toBe(false);
  });

  it('loadDocument sets state and analyzes synchronously', () => {
    loadDocument('/tmp/api.yaml', VALID_YAML, 'yaml');
    expect(openApiSession.documentUri).toBe('/tmp/api.yaml');
    expect(openApiSession.savedContent).toBe(VALID_YAML);
    expect(openApiSession.dirty).toBe(false);
    expect(openApiSession.version).toBe('3.1');
    expect(openApiSession.lastValidSpec).toBeDefined();
    expect(openApiSession.previewStale).toBe(false);
  });

  it('setContent marks dirty and reverts when content matches savedContent again', () => {
    loadDocument('/tmp/api.yaml', VALID_YAML, 'yaml');
    setContent(VALID_YAML + '# note\n');
    expect(openApiSession.dirty).toBe(true);
    setContent(VALID_YAML);
    expect(openApiSession.dirty).toBe(false);
  });

  it('debounces analysis on setContent', () => {
    loadDocument('/tmp/api.yaml', VALID_YAML, 'yaml');
    const edited = VALID_YAML.replace('3.1.0', '3.0.3');
    setContent(edited);
    expect(openApiSession.version).toBe('3.1');
    vi.advanceTimersByTime(350);
    expect(openApiSession.version).toBe('3.0');
  });

  it('keeps lastValidSpec and flags previewStale on a broken edit', () => {
    loadDocument('/tmp/api.yaml', VALID_YAML, 'yaml');
    const spec = openApiSession.lastValidSpec;
    setContent('openapi: 3.1.0\n  broken:\nindent');
    vi.advanceTimersByTime(350);
    expect(openApiSession.previewStale).toBe(true);
    expect(openApiSession.lastValidSpec).toBe(spec);
  });

  it('markSaved adopts the uri and clears dirty', () => {
    loadDocument(null, VALID_YAML, 'yaml');
    setContent(VALID_YAML + '# more\n');
    expect(openApiSession.dirty).toBe(true);
    markSaved('/tmp/saved.yaml');
    expect(openApiSession.documentUri).toBe('/tmp/saved.yaml');
    expect(openApiSession.dirty).toBe(false);
    expect(openApiSession.savedContent).toBe(VALID_YAML + '# more\n');
  });

  it('resetSession returns to the empty state and cancels pending analysis', () => {
    loadDocument('/tmp/api.yaml', VALID_YAML, 'yaml');
    setContent(VALID_YAML + 'x');
    resetSession();
    vi.advanceTimersByTime(350);
    expect(openApiSession.format).toBeNull();
    expect(openApiSession.analysis).toBeNull();
    expect(openApiSession.dirty).toBe(false);
  });

  it('a load cancels analysis scheduled by earlier edits', () => {
    loadDocument('/tmp/a.yaml', VALID_YAML, 'yaml');
    setContent('openapi: 3.0.3\n');
    loadDocument('/tmp/b.yaml', VALID_YAML, 'yaml');
    vi.advanceTimersByTime(350);
    expect(openApiSession.version).toBe('3.1');
  });
});
