import { buildPointer } from '../../pointer';
import type { LintFinding, LintRule } from '../types';
import { isRecord, specOf } from '../context';

/** Yields each server object with its declaration index. */
function servers(spec: Record<string, unknown>): Array<{ index: number; server: Record<string, unknown> }> {
  if (!Array.isArray(spec.servers)) return [];
  return spec.servers
    .map((server, index) => ({ index, server }))
    .filter((entry): entry is { index: number; server: Record<string, unknown> } => isRecord(entry.server));
}

const serverUsesHttp: LintRule = {
  id: 'server-uses-http',
  description: 'Server URL uses plaintext http:// instead of https://.',
  defaultSeverity: 'warning',
  run(analysis) {
    const spec = specOf(analysis);
    if (!spec) return [];
    const findings: LintFinding[] = [];
    for (const { index, server } of servers(spec)) {
      if (typeof server.url === 'string' && /^http:\/\//i.test(server.url)) {
        findings.push({
          message: `Server URL "${server.url}" uses plaintext http://; use https://.`,
          pointer: buildPointer(['servers', String(index), 'url']),
        });
      }
    }
    return findings;
  },
};

const serverUrlHasCredentials: LintRule = {
  id: 'server-url-has-credentials',
  description: 'Server URL embeds userinfo (user:pass@host), exposing credentials.',
  defaultSeverity: 'error',
  run(analysis) {
    const spec = specOf(analysis);
    if (!spec) return [];
    const findings: LintFinding[] = [];
    for (const { index, server } of servers(spec)) {
      // Match userinfo between the scheme and the host: scheme://user[:pass]@host
      if (typeof server.url === 'string' && /^[a-z][a-z0-9+.-]*:\/\/[^/@\s]+@/i.test(server.url)) {
        findings.push({
          message: `Server URL "${server.url}" embeds credentials; remove the userinfo component.`,
          pointer: buildPointer(['servers', String(index), 'url']),
        });
      }
    }
    return findings;
  },
};

export const serverRules: LintRule[] = [serverUsesHttp, serverUrlHasCredentials];
