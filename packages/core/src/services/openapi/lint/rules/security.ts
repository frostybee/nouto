import { buildPointer } from '../../pointer';
import type { LintFinding, LintRule } from '../types';
import { isRecord, operationViews, specOf } from '../context';

/** Named security scheme definitions under `components.securitySchemes`. */
function securitySchemes(spec: Record<string, unknown>): Array<[string, Record<string, unknown>]> {
  const components = isRecord(spec.components) ? spec.components : undefined;
  const schemes = components && isRecord(components.securitySchemes) ? components.securitySchemes : undefined;
  if (!schemes) return [];
  return Object.entries(schemes).filter(
    (entry): entry is [string, Record<string, unknown>] => isRecord(entry[1])
  );
}

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
        });
      }
    }
    return findings;
  },
};

const httpBasicScheme: LintRule = {
  id: 'http-basic-scheme',
  description: 'HTTP Basic authentication transmits credentials with every request.',
  defaultSeverity: 'warning',
  run(analysis) {
    const spec = specOf(analysis);
    if (!spec) return [];
    const findings: LintFinding[] = [];
    for (const [name, scheme] of securitySchemes(spec)) {
      if (scheme.type === 'http' && String(scheme.scheme).toLowerCase() === 'basic') {
        findings.push({
          message: `Security scheme "${name}" uses HTTP Basic authentication.`,
          pointer: buildPointer(['components', 'securitySchemes', name]),
        });
      }
    }
    return findings;
  },
};

const apiKeyInQuery: LintRule = {
  id: 'api-key-in-query',
  description: 'API keys in the query string leak into logs, history, and referrers.',
  defaultSeverity: 'warning',
  run(analysis) {
    const spec = specOf(analysis);
    if (!spec) return [];
    const findings: LintFinding[] = [];
    for (const [name, scheme] of securitySchemes(spec)) {
      if (scheme.type === 'apiKey' && scheme.in === 'query') {
        findings.push({
          message: `API key security scheme "${name}" is passed in the query string; prefer a header.`,
          pointer: buildPointer(['components', 'securitySchemes', name]),
        });
      }
    }
    return findings;
  },
};

export const securityRules: LintRule[] = [operationWithoutSecurity, httpBasicScheme, apiKeyInQuery];
