import type { LintFinding, LintRule } from '../types';
import { isRecord, operationViews, specOf } from '../context';

const missingInfoDescription: LintRule = {
  id: 'missing-info-description',
  description: 'The info object has no description.',
  defaultSeverity: 'warning',
  run(analysis) {
    const spec = specOf(analysis);
    if (!spec || !isRecord(spec.info)) return [];
    if (typeof spec.info.description === 'string' && spec.info.description.trim()) return [];
    return [{ message: 'The API info object has no description.', pointer: '/info', anchor: true }];
  },
};

const operationMissingDescription: LintRule = {
  id: 'operation-missing-description',
  description: 'Operation has neither a summary nor a description.',
  defaultSeverity: 'warning',
  run(analysis) {
    const findings: LintFinding[] = [];
    for (const { summary, object } of operationViews(analysis)) {
      const hasSummary = typeof object.summary === 'string' && object.summary.trim();
      const hasDescription = typeof object.description === 'string' && object.description.trim();
      if (!hasSummary && !hasDescription) {
        findings.push({
          message: `Operation ${summary.method.toUpperCase()} ${summary.path} has no summary or description.`,
          pointer: summary.pointer,
          anchor: true,
        });
      }
    }
    return findings;
  },
};

const operationMissingTags: LintRule = {
  id: 'operation-missing-tags',
  description: 'Operation declares no tags, so it cannot be grouped in documentation.',
  defaultSeverity: 'warning',
  run(analysis) {
    const findings: LintFinding[] = [];
    for (const { summary } of operationViews(analysis)) {
      if (summary.tags.length === 0) {
        findings.push({
          message: `Operation ${summary.method.toUpperCase()} ${summary.path} has no tags.`,
          pointer: summary.pointer,
          anchor: true,
        });
      }
    }
    return findings;
  },
};

const operationMissingOperationId: LintRule = {
  id: 'operation-missing-operation-id',
  description: 'Operation has no operationId, which client generators rely on.',
  defaultSeverity: 'warning',
  run(analysis) {
    const findings: LintFinding[] = [];
    for (const { summary, object } of operationViews(analysis)) {
      const id = object.operationId;
      if (typeof id !== 'string' || !id.trim()) {
        findings.push({
          message: `Operation ${summary.method.toUpperCase()} ${summary.path} has no operationId.`,
          pointer: summary.pointer,
          anchor: true,
        });
      }
    }
    return findings;
  },
};

/**
 * Speculative, opt-in rule (seeded into the default disabledRules): flags
 * operations whose success responses declare no rate-limit headers. Off by
 * default because not every API adopts the convention.
 */
const rateLimitHeaders: LintRule = {
  id: 'rate-limit-headers',
  description: 'Successful responses declare no rate-limit headers (X-RateLimit-*/RateLimit).',
  defaultSeverity: 'warning',
  run(analysis) {
    const findings: LintFinding[] = [];
    for (const { summary, object } of operationViews(analysis)) {
      const responses = isRecord(object.responses) ? object.responses : undefined;
      if (!responses) continue;
      const successCodes = Object.keys(responses).filter((code) => code.startsWith('2'));
      if (successCodes.length === 0) continue;
      const hasRateLimitHeader = successCodes.some((code) => {
        const response = responses[code];
        const headers = isRecord(response) && isRecord(response.headers) ? response.headers : undefined;
        return headers
          ? Object.keys(headers).some((header) => /^(x-)?ratelimit/i.test(header))
          : false;
      });
      if (!hasRateLimitHeader) {
        findings.push({
          message: `Operation ${summary.method.toUpperCase()} ${summary.path} declares no rate-limit headers on its success responses.`,
          pointer: `${summary.pointer}/responses`,
          anchor: true,
        });
      }
    }
    return findings;
  },
};

export const metadataRules: LintRule[] = [
  missingInfoDescription,
  operationMissingDescription,
  operationMissingTags,
  operationMissingOperationId,
];

/** Opt-in rules, registered but disabled by default. */
export const optInRules: LintRule[] = [rateLimitHeaders];
