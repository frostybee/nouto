/**
 * Minimal valid OpenAPI fragments inserted by the outline context-menu Add
 * commands. Plain JS values: specEdit's backends serialize them format-aware
 * (YAML fragment stringify / jsonc-parser modify), so nothing here is
 * YAML- or JSON-specific.
 */

/** New operation body: the smallest valid Operation Object. */
export const OPERATION_SKELETON = {
  responses: { '200': { description: 'OK' } },
} as const;

export function serverSkeleton(url: string, description?: string): Record<string, unknown> {
  return description ? { url, description } : { url };
}

export function tagSkeleton(name: string, description?: string): Record<string, unknown> {
  return description ? { name, description } : { name };
}

/**
 * Global security requirement: scheme name → required scopes. An empty object
 * is the OpenAPI idiom for "no authentication required" (optional security).
 */
export function securityRequirementSkeleton(schemeNames: string[]): Record<string, string[]> {
  return Object.fromEntries(schemeNames.map((name) => [name, []]));
}

/**
 * Security scheme presets offered by the Add Security Scheme QuickPick.
 * `focus` points (relative to the inserted scheme) at the placeholder value
 * the editor selects after insertion, when the preset has one worth editing.
 */
export const SECURITY_SCHEME_PRESETS: ReadonlyArray<{
  label: string;
  value: unknown;
  focus?: string;
}> = [
  {
    label: 'API Key',
    value: { type: 'apiKey', in: 'header', name: 'X-API-Key' },
    focus: '/name',
  },
  { label: 'HTTP Bearer', value: { type: 'http', scheme: 'bearer' } },
  { label: 'HTTP Basic', value: { type: 'http', scheme: 'basic' } },
  {
    label: 'OAuth2 Authorization Code',
    value: {
      type: 'oauth2',
      flows: {
        authorizationCode: {
          authorizationUrl: 'https://example.com/oauth/authorize',
          tokenUrl: 'https://example.com/oauth/token',
          scopes: {},
        },
      },
    },
    focus: '/flows/authorizationCode/authorizationUrl',
  },
  {
    label: 'OpenID Connect',
    value: { type: 'openIdConnect', openIdConnectUrl: 'https://example.com/.well-known/openid-configuration' },
    focus: '/openIdConnectUrl',
  },
];

/** Per-section skeleton for new `components.*` entries. */
export const COMPONENT_PRESETS: Readonly<Record<string, unknown>> = {
  schemas: { type: 'object', properties: {} },
  responses: { description: 'OK' },
  parameters: { name: 'param', in: 'query', schema: { type: 'string' } },
  examples: { value: {} },
  requestBodies: { content: { 'application/json': { schema: {} } } },
  headers: { schema: { type: 'string' } },
  links: { operationId: '' },
  callbacks: {},
  pathItems: {},
};
