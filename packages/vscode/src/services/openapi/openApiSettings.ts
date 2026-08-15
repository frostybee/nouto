import type * as vscode from 'vscode';
import { lintOptionsFromSettings } from '@nouto/core/services';
import type { LintOptions } from '@nouto/core/services';

const SETTINGS_KEY = 'nouto.settings';

export interface OpenApiSettings {
  lintEnabled: boolean;
  /** Per-rule severity map; `'off'` disables a rule. */
  lintRules: Record<string, 'error' | 'warning' | 'off'>;
  outlineSortAlphabetically: boolean;
  /** Enables schema-aware completion + hover documentation for OpenAPI docs. */
  intelliSenseEnabled: boolean;
  /** Resolves external `$ref`s across local workspace files (never network). */
  externalRefsEnabled: boolean;
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
    lintRules: (stored.openApiLintRules as Record<string, 'error' | 'warning' | 'off'>) ?? {},
    outlineSortAlphabetically: (stored.openApiOutlineSortAlphabetically as boolean) ?? false,
    intelliSenseEnabled: (stored.openApiIntelliSenseEnabled as boolean) ?? true,
    externalRefsEnabled: (stored.openApiExternalRefsEnabled as boolean) ?? true,
  };
}

/**
 * Lint options from the shared settings store, or undefined when lint is
 * disabled. Read fresh each call so setting changes take effect immediately.
 * The unified per-rule map feeds `severityOverrides` (its `'off'` entries
 * disable rules); opt-in rules stay off until the user picks a severity for
 * them (see `lintOptionsFromSettings`). Shared by
 * the diagnostics manager (what gets squiggled) and the code action provider
 * (what gets a fix), so the two never disagree on which rules are active.
 */
export function readLintOptions(context: vscode.ExtensionContext): LintOptions | undefined {
  const { lintEnabled, lintRules } = readOpenApiSettings(context);
  if (!lintEnabled) return undefined;
  return lintOptionsFromSettings(lintRules);
}
