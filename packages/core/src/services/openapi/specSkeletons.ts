/**
 * Minimal valid OpenAPI fragments inserted by the outline context-menu Add
 * commands. Plain JS values: specEdit's backends serialize them format-aware
 * (YAML fragment stringify / jsonc-parser modify), so nothing here is
 * YAML- or JSON-specific.
 */

/**
 * Full starter document for "New OpenAPI Spec" flows (VS Code command and the
 * desktop editor's New Spec action). A minimal-but-valid scaffold: the sample
 * server and /test operation give the outline something to show and teach the
 * document structure by example. '200' is quoted — unquoted it parses as a
 * YAML number, and status codes must be strings.
 */
export const OPENAPI_DOCUMENT_SKELETON = `openapi: 3.1.0
info:
  title: API Title
  version: 1.0.0
servers:
  - url: https://api.server.test/v1
paths:
  /test:
    get:
      responses:
        '200':
          description: OK
`;

/**
 * New operation body. Beyond the smallest valid Operation Object (one
 * response), this seeds the fields an author fills in next, so they can be
 * typed into directly rather than recalled and indented by hand.
 *
 * They are left empty rather than given placeholder prose: an undocumented
 * operation should keep reading as undocumented, and the lint rules that flag
 * it (`operation-missing-description` requires non-blank text) are the reminder
 * to fill them in. `parameters: []` is inert — identical in meaning to omitting
 * the key — and exists purely as a slot to type into.
 */
export const OPERATION_SKELETON = {
  summary: '',
  description: '',
  parameters: [],
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
  /**
   * Stable slug. Forms the direct command id
   * (`nouto.openApiOutline.addSecurityScheme.<id>`) that the Components
   * context menu binds to, so it must not change once shipped.
   */
  id: string;
  label: string;
  placeholder: string;
  value: unknown;
}> = [
  {
    id: 'apiKey',
    label: 'API Key',
    placeholder: 'apiKeyAuth',
    value: { type: 'apiKey', in: 'header', name: 'X-API-Key' },
  },
  { id: 'httpBearer', label: 'HTTP Bearer', placeholder: 'bearerAuth', value: { type: 'http', scheme: 'bearer' } },
  { id: 'httpBasic', label: 'HTTP Basic', placeholder: 'basicAuth', value: { type: 'http', scheme: 'basic' } },
  {
    id: 'oauth2AuthorizationCode',
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
    id: 'openIdConnect',
    label: 'OpenID Connect',
    placeholder: 'openIdAuth',
    value: { type: 'openIdConnect', openIdConnectUrl: 'https://example.com/.well-known/openid-configuration' },
  },
];

/**
 * Singular display name per `components.*` section, used for the direct
 * "Add <Thing>" entries on the Components context menu. Keyed by the same
 * section names as COMPONENT_PRESETS; a drift test keeps the two — and
 * package.json's command list — in step.
 */
export const COMPONENT_TITLES: Readonly<Record<string, string>> = {
  schemas: 'Schema',
  responses: 'Response',
  parameters: 'Parameter',
  examples: 'Example',
  requestBodies: 'Request Body',
  headers: 'Header',
  links: 'Link',
  callbacks: 'Callback',
  pathItems: 'Path Item',
};

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
