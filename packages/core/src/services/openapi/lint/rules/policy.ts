import { buildPointer, escapePointerSegment } from '../../pointer';
import type { LintFinding, LintRule } from '../types';
import { isRecord, operationViews, specOf } from '../context';

/**
 * Policy/style rules: on by default like the rest, but they encode an opinion
 * about how an API should be designed rather than a defect, so the Settings
 * page groups them separately with a note that turning them off is normal.
 */

const operationWithoutSecurity: LintRule = {
  id: 'operation-without-security',
  description: 'Operation defines no security requirement and no global default applies.',
  defaultSeverity: 'warning',
  run(analysis) {
    const spec = specOf(analysis);
    if (!spec) return [];
    const hasGlobal = Array.isArray(spec.security) && spec.security.length > 0;
    if (hasGlobal) return [];
    const findings: LintFinding[] = [];
    for (const { summary, object } of operationViews(analysis)) {
      const local = object.security;
      if (!Array.isArray(local) || local.length === 0) {
        findings.push({
          message: `Operation ${summary.method.toUpperCase()} ${summary.path} has no security requirement.`,
          pointer: summary.pointer,
          anchor: true,
        });
      }
    }
    return findings;
  },
};

const unusedComponentSchema: LintRule = {
  id: 'unused-component-schema',
  description: 'A component schema is never referenced by any $ref.',
  defaultSeverity: 'warning',
  run(analysis) {
    const spec = specOf(analysis);
    if (!spec || !isRecord(spec.components) || !isRecord(spec.components.schemas)) return [];
    const usedRefs = new Set(analysis.resolvedRefs.keys());
    const findings: LintFinding[] = [];
    for (const name of Object.keys(spec.components.schemas)) {
      const ref = `#/components/schemas/${escapePointerSegment(name)}`;
      if (!usedRefs.has(ref)) {
        findings.push({
          message: `Component schema "${name}" is never referenced.`,
          pointer: buildPointer(['components', 'schemas', name]),
          anchor: true,
        });
      }
    }
    return findings;
  },
};

export const policyRules: LintRule[] = [operationWithoutSecurity, unusedComponentSchema];
