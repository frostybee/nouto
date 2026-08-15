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

const serverUrlTrailingSlash: LintRule = {
  id: 'server-url-trailing-slash',
  description: 'Server URL ends with a slash, which doubles up when joined with paths.',
  defaultSeverity: 'warning',
  run(analysis) {
    const spec = specOf(analysis);
    if (!spec) return [];
    const findings: LintFinding[] = [];
    for (const { index, server } of servers(spec)) {
      // A bare "/" server (relative root) is legitimate.
      if (typeof server.url === 'string' && server.url.length > 1 && server.url.endsWith('/')) {
        findings.push({
          message: `Server URL "${server.url}" ends with a trailing slash.`,
          pointer: buildPointer(['servers', String(index), 'url']),
        });
      }
    }
    return findings;
  },
};

const serversEmpty: LintRule = {
  id: 'servers-empty',
  description: 'The document declares no servers, so tools default to the document location.',
  defaultSeverity: 'warning',
  run(analysis) {
    const spec = specOf(analysis);
    if (!spec) return [];
    if (Array.isArray(spec.servers) && spec.servers.length > 0) return [];
    // A components-only document (no operations) has nothing to serve.
    if (!isRecord(spec.paths) && !isRecord(spec.webhooks)) return [];
    return [{
      message: 'No servers are declared; add at least one server URL.',
      pointer: Array.isArray(spec.servers) ? '/servers' : '',
      anchor: true,
    }];
  },
};

/** `{name}` template names in a server URL. */
function serverUrlVariables(url: string): string[] {
  const names: string[] = [];
  const regex = /\{([^{}]+)\}/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(url)) !== null) names.push(match[1]);
  return names;
}

const serverVariableUndefined: LintRule = {
  id: 'server-variable-undefined',
  description: 'Server URL uses a {variable} that the server does not define.',
  defaultSeverity: 'error',
  run(analysis) {
    const spec = specOf(analysis);
    if (!spec) return [];
    const findings: LintFinding[] = [];
    for (const { index, server } of servers(spec)) {
      if (typeof server.url !== 'string') continue;
      const variables = isRecord(server.variables) ? server.variables : {};
      for (const name of new Set(serverUrlVariables(server.url))) {
        if (name in variables) continue;
        findings.push({
          message: `Server URL "${server.url}" uses {${name}} but declares no "${name}" variable.`,
          pointer: buildPointer(['servers', String(index), 'url']),
        });
      }
    }
    return findings;
  },
};

const serverVariableEmptyEnum: LintRule = {
  id: 'server-variable-empty-enum',
  description: 'Server variable declares an empty enum, or a default outside its enum.',
  defaultSeverity: 'error',
  run(analysis) {
    const spec = specOf(analysis);
    if (!spec) return [];
    const findings: LintFinding[] = [];
    for (const { index, server } of servers(spec)) {
      if (!isRecord(server.variables)) continue;
      for (const [name, variable] of Object.entries(server.variables)) {
        if (!isRecord(variable) || !Array.isArray(variable.enum)) continue;
        if (variable.enum.length === 0) {
          findings.push({
            message: `Server variable "${name}" declares an empty enum.`,
            pointer: buildPointer(['servers', String(index), 'variables', name, 'enum']),
          });
        } else if (typeof variable.default === 'string' && !variable.enum.includes(variable.default)) {
          findings.push({
            message: `Server variable "${name}" default "${variable.default}" is not one of its enum values.`,
            pointer: buildPointer(['servers', String(index), 'variables', name, 'default']),
          });
        }
      }
    }
    return findings;
  },
};

export const serverRules: LintRule[] = [
  serverUsesHttp,
  serverUrlHasCredentials,
  serverUrlTrailingSlash,
  serversEmpty,
  serverVariableUndefined,
  serverVariableEmptyEnum,
];
