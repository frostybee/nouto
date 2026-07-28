import type * as vscode from 'vscode';
import { readOpenApiSettings } from './openApiSettings';

function fakeContext(settings?: Record<string, unknown>): vscode.ExtensionContext {
  return {
    globalState: {
      get: (key: string) => (key === 'nouto.settings' ? settings : undefined),
    },
  } as unknown as vscode.ExtensionContext;
}

describe('readOpenApiSettings', () => {
  it('returns canonical defaults for an empty globalState', () => {
    expect(readOpenApiSettings(fakeContext())).toEqual({
      lintEnabled: true,
      lintRules: { 'rate-limit-headers': 'off' },
      outlineSortAlphabetically: false,
      intelliSenseEnabled: true,
      externalRefsEnabled: true,
    });
  });

  it('parses a populated settings blob', () => {
    const settings = {
      openApiLintEnabled: false,
      openApiLintRules: { 'operation-missing-tags': 'error' },
      openApiOutlineSortAlphabetically: true,
      openApiIntelliSenseEnabled: false,
      openApiExternalRefsEnabled: false,
    };
    expect(readOpenApiSettings(fakeContext(settings))).toEqual({
      lintEnabled: false,
      lintRules: { 'operation-missing-tags': 'error' },
      outlineSortAlphabetically: true,
      intelliSenseEnabled: false,
      externalRefsEnabled: false,
    });
  });

  it('falls back per-field for a partially populated blob', () => {
    const result = readOpenApiSettings(fakeContext({ openApiOutlineSortAlphabetically: true }));
    expect(result.lintEnabled).toBe(true);
    expect(result.lintRules).toEqual({ 'rate-limit-headers': 'off' });
    expect(result.outlineSortAlphabetically).toBe(true);
    expect(result.intelliSenseEnabled).toBe(true);
    expect(result.externalRefsEnabled).toBe(true);
  });
});
