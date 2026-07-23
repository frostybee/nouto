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

/**
 * Path Parameter Object inserted by the "add missing path parameter" quick
 * fix. `name` is overwritten with the offending template name; `in: path`
 * parameters are always required per the OpenAPI spec.
 */
export const PATH_PARAMETER_SKELETON = {
  name: 'param',
  in: 'path',
  required: true,
  schema: { type: 'string' },
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
 * `placeholder` seeds the scheme's key name; the editor selects it after
 * insertion for an inline rename (uniquified against existing names first).
 */
export const SECURITY_SCHEME_PRESETS: ReadonlyArray<{
  label: string;
  placeholder: string;
  value: unknown;
}> = [
  {
    label: 'API Key',
    placeholder: 'apiKeyAuth',
    value: { type: 'apiKey', in: 'header', name: 'X-API-Key' },
  },
  { label: 'HTTP Bearer', placeholder: 'bearerAuth', value: { type: 'http', scheme: 'bearer' } },
  { label: 'HTTP Basic', placeholder: 'basicAuth', value: { type: 'http', scheme: 'basic' } },
  {
    label: 'OAuth2 Authorization Code',
    placeholder: 'oauth2Auth',
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
  },
  {
    label: 'OpenID Connect',
    placeholder: 'openIdAuth',
    value: { type: 'openIdConnect', openIdConnectUrl: 'https://example.com/.well-known/openid-configuration' },
  },
];

/** Placeholder key names for new components, per section. */
export const COMPONENT_PLACEHOLDERS: Readonly<Record<string, string>> = {
  schemas: 'NewSchema',
  responses: 'NewResponse',
  parameters: 'NewParameter',
  examples: 'NewExample',
  requestBodies: 'NewRequestBody',
  headers: 'NewHeader',
  links: 'NewLink',
  callbacks: 'NewCallback',
  pathItems: 'NewPathItem',
};

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
