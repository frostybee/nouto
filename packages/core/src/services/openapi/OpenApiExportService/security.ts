/**
 * Security-scheme inference for the contract generator: Nouto auth states and
 * HAR Authorization headers map to standard OpenAPI security schemes, keyed
 * for dedup across operations.
 */
import type { AuthState } from '../../../types';
import type { NormalizedSecurity } from '../types';
import { uniqueName } from './normalize';

export function buildSecurityScheme(auth: AuthState, warnings: string[]): NormalizedSecurity | undefined {
  switch (auth?.type) {
    case 'basic':
      return { key: 'http:basic', scheme: { type: 'http', scheme: 'basic' } };
    case 'bearer':
      return { key: 'http:bearer', scheme: { type: 'http', scheme: 'bearer' } };
    case 'digest':
      return { key: 'http:digest', scheme: { type: 'http', scheme: 'digest' } };
    case 'apikey': {
      const name = auth.apiKeyName || 'X-Api-Key';
      const location = auth.apiKeyIn === 'query' ? 'query' : 'header';
      return {
        key: `apiKey:${location}:${name}`,
        scheme: { type: 'apiKey', name, in: location },
      };
    }
    case 'oauth2':
      return oauth2Scheme(auth, warnings);
    case 'aws':
      warnings.push('AWS Signature auth has no OpenAPI security scheme; security omitted');
      return undefined;
    case 'ntlm':
      warnings.push('NTLM auth has no OpenAPI security scheme; security omitted');
      return undefined;
    default:
      return undefined;
  }
}

function oauth2Scheme(auth: AuthState, warnings: string[]): NormalizedSecurity | undefined {
  const config = auth.oauth2;
  if (!config) {
    warnings.push('OAuth2 auth has no configuration; security omitted');
    return undefined;
  }
  const scopes: Record<string, string> = {};
  for (const scope of (config.scope ?? '').split(/[\s,]+/).filter(Boolean)) {
    scopes[scope] = '';
  }

  const flowByGrant: Record<string, { name: string; flow: Record<string, unknown>; missing?: string }> = {
    authorization_code: {
      name: 'authorizationCode',
      flow: { authorizationUrl: config.authUrl, tokenUrl: config.tokenUrl, scopes },
      missing: !config.authUrl || !config.tokenUrl ? 'authorization and token URLs' : undefined,
    },
    client_credentials: {
      name: 'clientCredentials',
      flow: { tokenUrl: config.tokenUrl, scopes },
      missing: !config.tokenUrl ? 'a token URL' : undefined,
    },
    implicit: {
      name: 'implicit',
      flow: { authorizationUrl: config.authUrl, scopes },
      missing: !config.authUrl ? 'an authorization URL' : undefined,
    },
    password: {
      name: 'password',
      flow: { tokenUrl: config.tokenUrl, scopes },
      missing: !config.tokenUrl ? 'a token URL' : undefined,
    },
  };
  const entry = flowByGrant[config.grantType];
  if (!entry) {
    warnings.push(`OAuth2 grant type '${config.grantType}' is not exportable; security omitted`);
    return undefined;
  }
  if (entry.missing) {
    warnings.push(`OAuth2 ${config.grantType} flow is missing ${entry.missing}; security omitted`);
    return undefined;
  }
  return {
    key: `oauth2:${config.grantType}:${config.authUrl ?? ''}:${config.tokenUrl ?? ''}`,
    scheme: { type: 'oauth2', flows: { [entry.name]: entry.flow } },
  };
}

/** `Bearer x`/`Basic y` Authorization headers in a HAR map to http schemes. */
export function securityFromAuthorizationHeader(value: string | undefined): NormalizedSecurity | undefined {
  const kind = value?.trim().split(/\s+/)[0]?.toLowerCase();
  if (kind === 'bearer') return { key: 'http:bearer', scheme: { type: 'http', scheme: 'bearer' } };
  if (kind === 'basic') return { key: 'http:basic', scheme: { type: 'http', scheme: 'basic' } };
  if (kind === 'digest') return { key: 'http:digest', scheme: { type: 'http', scheme: 'digest' } };
  return undefined;
}

const SCHEME_BASE_NAMES: Record<string, string> = {
  'http:basic': 'basicAuth',
  'http:bearer': 'bearerAuth',
  'http:digest': 'digestAuth',
};

export function uniqueSchemeName(key: string, used: Set<string>): string {
  const base = SCHEME_BASE_NAMES[key] ?? (key.startsWith('apiKey:') ? 'apiKeyAuth' : 'oauth2Auth');
  return uniqueName(base, used);
}
