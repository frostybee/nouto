import type { LintFinding, LintRule } from '../types';
import { isRecord, operationViews } from '../context';

/** Response status keys of a given class (e.g. '4') present on an operation. */
function hasResponseClass(responses: Record<string, unknown>, cls: '4' | '5'): boolean {
  return Object.keys(responses).some((code) => code === 'default' || code.startsWith(cls));
}

function missingResponseClassRule(cls: '4' | '5', label: string): LintRule {
  return {
    id: `operation-missing-${cls}xx`,
    description: `Operation declares no ${label} (${cls}xx) or default response.`,
    defaultSeverity: 'warning',
    run(analysis) {
      const findings: LintFinding[] = [];
      for (const { summary, object } of operationViews(analysis)) {
        const responses = isRecord(object.responses) ? object.responses : undefined;
        if (!responses) continue;
        if (!hasResponseClass(responses, cls)) {
          findings.push({
            message: `Operation ${summary.method.toUpperCase()} ${summary.path} declares no ${cls}xx (${label}) or default response.`,
            pointer: `${summary.pointer}/responses`,
          });
        }
      }
      return findings;
    },
  };
}

export const responseRules: LintRule[] = [
  missingResponseClassRule('4', 'client error'),
  missingResponseClassRule('5', 'server error'),
];
