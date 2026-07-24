import { parsePointer } from '../pointer';
import { classifyPointer } from './classifier';
import type { OpenApiNodeKind } from './types';

function kindOf(pointer: string): OpenApiNodeKind {
  const segments = parsePointer(pointer);
  if (segments === undefined) throw new Error(`invalid pointer: ${pointer}`);
  return classifyPointer(segments).kind;
}

describe('classifyPointer', () => {
  it('classifies the top-level document objects', () => {
    expect(kindOf('')).toBe('Root');
    expect(kindOf('/info')).toBe('Info');
    expect(kindOf('/info/contact')).toBe('Contact');
    expect(kindOf('/info/license')).toBe('License');
    expect(kindOf('/externalDocs')).toBe('ExternalDocs');
    expect(kindOf('/components')).toBe('Components');
  });

  it('classifies servers and their variables', () => {
    expect(kindOf('/servers/0')).toBe('Server');
    expect(kindOf('/servers/0/variables/env')).toBe('ServerVariable');
    expect(kindOf('/tags/0')).toBe('Tag');
  });

  it('walks paths into operations and their members', () => {
    expect(kindOf('/paths/~1pets')).toBe('PathItem');
    expect(kindOf('/paths/~1pets/get')).toBe('Operation');
    expect(kindOf('/paths/~1pets/get/parameters/0')).toBe('Parameter');
    expect(kindOf('/paths/~1pets/get/requestBody')).toBe('RequestBody');
    expect(kindOf('/paths/~1pets/get/responses/200')).toBe('Response');
    expect(kindOf('/paths/~1pets/get/responses/200/content/application~1json')).toBe('MediaType');
  });

  it('classifies 3.2 path-item additions (query method, additionalOperations)', () => {
    expect(kindOf('/paths/~1pets/query')).toBe('Operation');
    expect(kindOf('/paths/~1pets/additionalOperations/PURGE')).toBe('Operation');
  });

  it('treats webhooks and reusable path items like paths', () => {
    expect(kindOf('/webhooks/newPet/post')).toBe('Operation');
    expect(kindOf('/components/pathItems/Shared/get')).toBe('Operation');
  });

  it('resolves media types, headers, examples and links', () => {
    expect(kindOf('/paths/~1p/get/responses/200/content/application~1json/schema')).toBe('Schema');
    expect(kindOf('/paths/~1p/get/responses/200/headers/X-Rate-Limit')).toBe('Header');
    expect(kindOf('/paths/~1p/get/responses/200/headers/X-Rate-Limit/schema')).toBe('Schema');
    expect(kindOf('/paths/~1p/get/responses/200/links/Self')).toBe('Link');
    expect(kindOf('/paths/~1p/post/requestBody/content/application~1json/examples/one')).toBe('Example');
  });

  it('resolves callbacks back into operations', () => {
    expect(kindOf('/paths/~1p/post/callbacks/onData')).toBe('Callback');
    expect(kindOf('/paths/~1p/post/callbacks/onData/{$request.body#~1url}/post')).toBe('Operation');
  });

  it('recurses through nested schemas to unbounded depth', () => {
    expect(kindOf('/components/schemas/Pet')).toBe('Schema');
    expect(kindOf('/components/schemas/Pet/properties/id')).toBe('Schema');
    expect(kindOf('/components/schemas/Pet/properties/tags/items')).toBe('Schema');
    expect(kindOf('/components/schemas/Pet/allOf/0')).toBe('Schema');
    expect(kindOf('/components/schemas/Pet/properties/a/properties/b/additionalProperties')).toBe('Schema');
    expect(kindOf('/components/schemas/Pet/discriminator')).toBe('Discriminator');
    expect(kindOf('/components/schemas/Pet/xml')).toBe('XML');
  });

  it('classifies security schemes and oauth flows', () => {
    expect(kindOf('/components/securitySchemes/apiKey')).toBe('SecurityScheme');
    expect(kindOf('/components/securitySchemes/oauth/flows')).toBe('OAuthFlows');
    expect(kindOf('/components/securitySchemes/oauth/flows/authorizationCode')).toBe('OAuthFlow');
    expect(kindOf('/security')).toBe('SecurityRequirement');
  });

  it('returns Unknown for container levels with dynamic keys and vendor extensions', () => {
    expect(kindOf('/paths')).toBe('Paths'); // the container; /paths/<template> is a PathItem
    expect(kindOf('/components/schemas')).toBe('Unknown');
    expect(kindOf('/paths/~1p/get/x-internal')).toBe('Unknown');
    expect(kindOf('/paths/~1p/get/responses/200/content')).toBe('Unknown');
  });

  it('reports the classified pointer and component section', () => {
    const result = classifyPointer(['components', 'schemas']);
    expect(result.section).toBe('schemas');
    expect(result.pointer).toBe('/components/schemas');
  });
});
