import type { OpenApiAnalysis, OpenApiDiagnostic } from '../types';
import type { LintOptions, LintRule } from './types';
import { securityRules } from './rules/security';
import { serverRules } from './rules/servers';
import { responseRules } from './rules/responses';
import { schemaRules } from './rules/schemas';
import { metadataRules, optInRules } from './rules/metadata';

/**
 * Every registered lint rule. Opt-in rules are included here (so they can be
 * enabled) but appear in DEFAULT_DISABLED_RULES, so a default pass skips them.
 */
export const ALL_LINT_RULES: LintRule[] = [
  ...securityRules,
  ...serverRules,
  ...responseRules,
  ...schemaRules,
  ...metadataRules,
  ...optInRules,
];

/** Rule ids skipped unless the caller supplies its own disabledRules list. */
export const DEFAULT_DISABLED_RULES: string[] = optInRules.map((rule) => rule.id);

/**
 * Runs the lint rules over an analyzed document and returns `'lint'`-sourced
 * diagnostics, each stamped with its rule id as `code`. Rules are skipped when
 * disabled or overridden to `'off'`; severity overrides replace the rule's
 * default. Returns nothing when the content did not parse.
 */
export function runLintRules(
  analysis: OpenApiAnalysis,
  options: LintOptions = {}
): OpenApiDiagnostic[] {
  if (!analysis.parsedSpec) return [];
  // `undefined` → default opt-in set; an explicit list (including `[]`) wins.
  const disabled = new Set(options.disabledRules ?? DEFAULT_DISABLED_RULES);
  const overrides = options.severityOverrides ?? {};
  const diagnostics: OpenApiDiagnostic[] = [];

  for (const rule of ALL_LINT_RULES) {
    if (disabled.has(rule.id)) continue;
    const override = overrides[rule.id];
    if (override === 'off') continue;
    const severity = override ?? rule.defaultSeverity;
    for (const finding of rule.run(analysis)) {
      diagnostics.push({
        source: 'lint',
        severity,
        message: finding.message,
        pointer: finding.pointer,
        code: rule.id,
      });
    }
  }
  return diagnostics;
}
