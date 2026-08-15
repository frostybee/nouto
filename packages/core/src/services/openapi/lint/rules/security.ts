import { buildPointer } from '../../pointer';
import type { LintFinding, LintRule } from '../types';
import { securitySchemes, specOf } from '../context';

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

export const securityRules: LintRule[] = [httpBasicScheme, apiKeyInQuery];
