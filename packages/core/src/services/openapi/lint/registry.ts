import type { OpenApiAnalysis, OpenApiDiagnostic } from '../types';
import type { LintOptions, LintRule, LintSeverity } from './types';
import { securityRules } from './rules/security';
import { serverRules } from './rules/servers';
import { responseRules } from './rules/responses';
import { schemaRules } from './rules/schemas';
import { metadataRules, optInRules } from './rules/metadata';
import { policyRules } from './rules/policy';
import { pathRules } from './rules/paths';

/**
 * Every registered lint rule. Opt-in rules are included here (so they can be
 * enabled) but appear in DEFAULT_DISABLED_RULES, so a default pass skips them.
 */
export const ALL_LINT_RULES: LintRule[] = [
  ...securityRules,
  ...serverRules,
  ...responseRules,
  ...pathRules,
  ...schemaRules,
  ...metadataRules,
  ...policyRules,
  ...optInRules,
];

/** Rule ids skipped unless the caller supplies its own disabledRules list. */
export const DEFAULT_DISABLED_RULES: string[] = optInRules.map((rule) => rule.id);

/**
 * Builds lint options from a host's per-rule severity map (the Settings
 * panel's `openApiLintRules`). Opt-in rules stay disabled until the user has
 * explicitly chosen a severity for them, so adding a new opt-in rule never
 * turns it on for users whose stored settings predate it. Every other rule
 * runs at its default unless overridden.
 */
export function lintOptionsFromSettings(
  rules: Record<string, LintSeverity | 'off'> | undefined
): LintOptions {
  const overrides = rules ?? {};
  return {
    disabledRules: DEFAULT_DISABLED_RULES.filter((id) => overrides[id] === undefined),
    severityOverrides: overrides,
  };
}

/** The severity a rule runs at under `options`, or `'off'` when it is skipped. */
export function effectiveSeverity(rule: LintRule, options: LintOptions = {}): LintSeverity | 'off' {
  const disabled = new Set(options.disabledRules ?? DEFAULT_DISABLED_RULES);
  if (disabled.has(rule.id)) return 'off';
  const override = (options.severityOverrides ?? {})[rule.id];
  return override ?? rule.defaultSeverity;
}

/** Metadata-only view of a lint rule, for rendering the Settings UI. */
export interface LintRuleCatalogEntry {
  id: string;
  description: string;
  defaultSeverity: LintSeverity;
  /** Display group the rule belongs to (e.g. 'Security'). */
  group: string;
}

const meta = (rule: LintRule): Omit<LintRuleCatalogEntry, 'group'> => ({
  id: rule.id,
  description: rule.description,
  defaultSeverity: rule.defaultSeverity,
});

/**
 * Every lint rule grouped for display, without the `run` closures. The Settings
 * panel iterates this to offer a per-rule Off/Warning/Error control. Stays in
 * lock-step with ALL_LINT_RULES (a core test asserts full coverage).
 */
export const LINT_RULES_CATALOG: LintRuleCatalogEntry[] = [
  ...securityRules.map((rule) => ({ ...meta(rule), group: 'Security' })),
  ...serverRules.map((rule) => ({ ...meta(rule), group: 'Servers' })),
  ...responseRules.map((rule) => ({ ...meta(rule), group: 'Responses' })),
  ...pathRules.map((rule) => ({ ...meta(rule), group: 'Paths' })),
  ...schemaRules.map((rule) => ({ ...meta(rule), group: 'Schemas' })),
  ...metadataRules.map((rule) => ({ ...meta(rule), group: 'Metadata' })),
  ...policyRules.map((rule) => ({ ...meta(rule), group: 'Policy' })),
  ...optInRules.map((rule) => ({ ...meta(rule), group: 'Opt-in' })),
];

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
  const diagnostics: OpenApiDiagnostic[] = [];

  for (const rule of ALL_LINT_RULES) {
    const severity = effectiveSeverity(rule, options);
    if (severity === 'off') continue;
    for (const finding of rule.run(analysis)) {
      diagnostics.push({
        source: 'lint',
        severity,
        message: finding.message,
        pointer: finding.pointer,
        code: rule.id,
        ...(finding.anchor ? { data: { anchor: true } } : {}),
      });
    }
  }
  return diagnostics;
}
