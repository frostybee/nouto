import type * as vscode from 'vscode';

const SETTINGS_KEY = 'nouto.settings';

export interface OpenApiSettings {
  lintEnabled: boolean;
  /** Per-rule severity map; `'off'` disables a rule. */
  lintRules: Record<string, 'error' | 'warning' | 'off'>;
  outlineSortAlphabetically: boolean;
  /** Enables schema-aware completion + hover documentation for OpenAPI docs. */
  intelliSenseEnabled: boolean;
}

/**
 * Reads the OpenAPI editor settings from Nouto's shared `nouto.settings` blob
 * (the same store the Settings panel and desktop app persist to), applying the
 * canonical defaults. Read fresh on each use so changes take effect without a
 * restart.
 */
export function readOpenApiSettings(context: vscode.ExtensionContext): OpenApiSettings {
  const stored = context.globalState.get<Record<string, unknown>>(SETTINGS_KEY) ?? {};
  return {
    lintEnabled: (stored.openApiLintEnabled as boolean) ?? true,
    lintRules:
      (stored.openApiLintRules as Record<string, 'error' | 'warning' | 'off'>) ??
      { 'rate-limit-headers': 'off' },
    outlineSortAlphabetically: (stored.openApiOutlineSortAlphabetically as boolean) ?? false,
    intelliSenseEnabled: (stored.openApiIntelliSenseEnabled as boolean) ?? true,
  };
}
