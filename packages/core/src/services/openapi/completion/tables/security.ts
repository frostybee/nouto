import type { NodeKindTable } from '../types';

/** Curated completion tables for Security Scheme, OAuth Flows and OAuth Flow. */

const securitySchemeTable: NodeKindTable = {
  kind: 'SecurityScheme',
  properties: [
    { name: 'type', docs: 'The type of the security scheme.', insertKind: 'enum-value', required: true, enumValues: [
      { value: 'apiKey' }, { value: 'http' }, { value: 'mutualTLS', sinceVersion: '3.1' }, { value: 'oauth2' }, { value: 'openIdConnect' },
    ] },
    { name: 'description', docs: 'A description for the security scheme. CommonMark syntax MAY be used.', insertKind: 'scalar' },
    { name: 'name', docs: 'The name of the header, query or cookie parameter. Applies to `apiKey`.', insertKind: 'scalar' },
    { name: 'in', docs: 'The location of the API key. Applies to `apiKey`.', insertKind: 'enum-value', enumValues: [{ value: 'query' }, { value: 'header' }, { value: 'cookie' }] },
    { name: 'scheme', docs: 'The HTTP Authorization scheme (e.g. `basic`, `bearer`). Applies to `http`.', insertKind: 'scalar' },
    { name: 'bearerFormat', docs: 'A hint about the bearer token format, e.g. `JWT`. Applies to `http` bearer.', insertKind: 'scalar' },
    { name: 'flows', docs: 'The OAuth Flow Objects for the supported flow types. Applies to `oauth2`.', insertKind: 'object' },
    { name: 'oauth2MetadataUrl', docs: 'The URL of the OAuth 2.0 Authorization Server Metadata document. Applies to `oauth2`.', insertKind: 'scalar', sinceVersion: '3.2' },
    { name: 'openIdConnectUrl', docs: 'The OpenID Connect Discovery URL. Applies to `openIdConnect`.', insertKind: 'scalar' },
    { name: 'deprecated', docs: 'Declares this security scheme to be deprecated.', insertKind: 'enum-value', sinceVersion: '3.2', enumValues: [{ value: 'true' }, { value: 'false' }] },
  ],
};

const oauthFlowsTable: NodeKindTable = {
  kind: 'OAuthFlows',
  properties: [
    { name: 'implicit', docs: 'Configuration for the OAuth Implicit flow.', insertKind: 'object' },
    { name: 'password', docs: 'Configuration for the OAuth Resource Owner Password flow.', insertKind: 'object' },
    { name: 'clientCredentials', docs: 'Configuration for the OAuth Client Credentials flow.', insertKind: 'object' },
    { name: 'authorizationCode', docs: 'Configuration for the OAuth Authorization Code flow.', insertKind: 'object' },
    { name: 'deviceAuthorization', docs: 'Configuration for the OAuth Device Authorization flow.', insertKind: 'object', sinceVersion: '3.2' },
  ],
};

const oauthFlowTable: NodeKindTable = {
  kind: 'OAuthFlow',
  properties: [
    { name: 'authorizationUrl', docs: 'The authorization URL. Required for `implicit` and `authorizationCode`.', insertKind: 'scalar' },
    { name: 'deviceAuthorizationUrl', docs: 'The device authorization endpoint URL. Required for `deviceAuthorization`.', insertKind: 'scalar', sinceVersion: '3.2' },
    { name: 'tokenUrl', docs: 'The token URL. Required for `password`, `clientCredentials`, `authorizationCode`.', insertKind: 'scalar' },
    { name: 'refreshUrl', docs: 'The URL to be used for obtaining refresh tokens.', insertKind: 'scalar' },
    { name: 'scopes', docs: 'The available scopes for the OAuth2 scheme, as a map of name to description. Required.', insertKind: 'object', required: true, snippetBody: '\n  ${1:scope}: ${2:description}' },
  ],
};

export const securityTables: NodeKindTable[] = [securitySchemeTable, oauthFlowsTable, oauthFlowTable];
