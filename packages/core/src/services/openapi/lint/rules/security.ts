import { buildPointer, escapePointerSegment } from '../../pointer';
import type { LintFinding, LintRule } from '../types';
import { isRecord, securitySchemes, specOf } from '../context';

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

/** Free-text fields that documentation renderers treat as Markdown/HTML. */
const MARKDOWN_KEYS = new Set(['description', 'summary', 'title', 'termsOfService']);
const UNSAFE_MARKDOWN = /<script\b|eval\s*\(|javascript:/i;

const markdownUnsafe: LintRule = {
  id: 'markdown-unsafe',
  description: 'A description or summary contains script tags, eval(), or javascript: URLs that could execute in rendered docs.',
  defaultSeverity: 'warning',
  run(analysis) {
    const spec = specOf(analysis);
    if (!spec) return [];
    const findings: LintFinding[] = [];
    const visit = (node: unknown, pointer: string): void => {
      if (Array.isArray(node)) {
        node.forEach((item, index) => visit(item, `${pointer}/${index}`));
        return;
      }
      if (!isRecord(node)) return;
      for (const [key, value] of Object.entries(node)) {
        const childPointer = `${pointer}/${escapePointerSegment(key)}`;
        if (MARKDOWN_KEYS.has(key) && typeof value === 'string') {
          if (UNSAFE_MARKDOWN.test(value)) {
            findings.push({
              message: `"${key}" contains potentially executable content (script tag, eval, or javascript: URL).`,
              pointer: childPointer,
            });
          }
          continue;
        }
        visit(value, childPointer);
      }
    };
    visit(spec, '');
    return findings;
  },
};

export const securityRules: LintRule[] = [httpBasicScheme, apiKeyInQuery, markdownUnsafe];
