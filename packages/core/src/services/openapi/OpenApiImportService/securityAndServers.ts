/**
 * Security-scheme-to-auth mapping and server/variable handling for the
 * importer.
 */
import type { AuthState, Environment, EnvironmentVariable } from '../../../types';
import { generateId } from '../../../types';
import type { OpenApiServer, OpenApiSpec } from './specTypes';

export function convertSecurityToAuth(
  spec: OpenApiSpec,
  opSecurity: Record<string, string[]>[] | undefined,
  warnings: string[]
): AuthState {
  const security = opSecurity || spec.security;
  if (!security || security.length === 0) return { type: 'none' };

  const schemes = spec.components?.securitySchemes || {};
  const firstScheme = security[0];
  const schemeNames = Object.keys(firstScheme);
  const schemeName = schemeNames[0];
  if (!schemeName) return { type: 'none' };
  // A single requirement object with several keys means ALL schemes are
  // required together — distinct from multiple alternative objects.
  if (schemeNames.length > 1) {
    warnings.push(
      `The operation requires multiple security schemes together (${schemeNames.join(', ')}); only "${schemeName}" was applied.`
    );
  }

  const scheme = schemes[schemeName];
  if (!scheme) return { type: 'none' };

  switch (scheme.type) {
    case 'http':
      if (scheme.scheme === 'basic') {
        return { type: 'basic', username: '', password: '' };
      }
      if (scheme.scheme === 'bearer') {
        return { type: 'bearer', token: '' };
      }
      return { type: 'none' };

    case 'apiKey':
      // The auth model only supports header/query placement.
      if (scheme.in === 'cookie') {
        warnings.push(
          `API key security scheme "${schemeName}" uses cookie placement, which is not supported; it was applied as a header instead.`
        );
      }
      return {
        type: 'apikey',
        apiKeyName: scheme.name || '',
        apiKeyValue: '',
        apiKeyIn: (scheme.in === 'query' ? 'query' : 'header') as 'header' | 'query',
      };

    case 'oauth2': {
      const flows = scheme.flows || {};
      if (flows.authorizationCode) {
        return {
          type: 'oauth2',
          oauth2: {
            grantType: 'authorization_code',
            authUrl: flows.authorizationCode.authorizationUrl,
            tokenUrl: flows.authorizationCode.tokenUrl,
            clientId: '',
            scope: Object.keys(flows.authorizationCode.scopes || {}).join(' '),
          },
        };
      }
      if (flows.clientCredentials) {
        return {
          type: 'oauth2',
          oauth2: {
            grantType: 'client_credentials',
            tokenUrl: flows.clientCredentials.tokenUrl,
            clientId: '',
            scope: Object.keys(flows.clientCredentials.scopes || {}).join(' '),
          },
        };
      }
      if (flows.implicit) {
        return {
          type: 'oauth2',
          oauth2: {
            grantType: 'implicit',
            authUrl: flows.implicit.authorizationUrl,
            clientId: '',
            scope: Object.keys(flows.implicit.scopes || {}).join(' '),
          },
        };
      }
      if (flows.password) {
        return {
          type: 'oauth2',
          oauth2: {
            grantType: 'password',
            tokenUrl: flows.password.tokenUrl,
            clientId: '',
          },
        };
      }
      return { type: 'none' };
    }

    default:
      return { type: 'none' };
  }
}

export function resolveBaseUrl(servers: OpenApiServer[] | undefined, warnings: string[]): string {
  if (!servers || servers.length === 0) return '';
  const server = servers[0];
  let url = server.url;

  if (server.variables) {
    for (const [name, variable] of Object.entries(server.variables)) {
      url = url.replace(`{${name}}`, variable.default);
    }
  }

  // The spec allows relative server URLs (resolved against where the
  // document is served from) — meaningless for a standalone client.
  if (!/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(url) && !url.startsWith('//')) {
    warnings.push(
      `Server URL "${url}" has no scheme; the request URL may need a base URL to be runnable.`
    );
  }

  return url.replace(/\/$/, '');
}

export function extractServerVariables(spec: OpenApiSpec): Environment | undefined {
  if (!spec.servers || spec.servers.length === 0) return undefined;

  const variables: EnvironmentVariable[] = [];
  for (const server of spec.servers) {
    if (!server.variables) continue;
    for (const [name, variable] of Object.entries(server.variables)) {
      if (!variables.some(v => v.key === name)) {
        variables.push({
          key: name,
          value: variable.default,
          enabled: true,
        });
      }
    }
  }

  for (const [path] of Object.entries(spec.paths ?? {})) {
    const pathParamRegex = /\{(\w+)\}/g;
    let match;
    while ((match = pathParamRegex.exec(path)) !== null) {
      const paramName = match[1];
      if (!variables.some(v => v.key === paramName)) {
        variables.push({
          key: paramName,
          value: '',
          enabled: true,
        });
      }
    }
  }

  if (variables.length === 0) return undefined;

  return {
    id: generateId(),
    name: `${spec.info.title} Variables`,
    variables,
  };
}
