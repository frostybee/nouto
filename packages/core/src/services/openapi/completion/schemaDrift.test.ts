import type { OpenApiVersion } from '../types';
import type { OpenApiNodeKind } from './types';
import {
  openapi30MetaSchema,
  openapi31MetaSchema,
  openapi32MetaSchema,
} from '../schemas';
import { getCompletions } from './registry';

/**
 * Drift guard: mechanically compares the curated completion tables against the
 * vendored official OpenAPI meta-schemas so the tables can never silently fall
 * behind the spec (or accumulate typos), while staying hand-authored for docs,
 * snippets and required-key scaffolding (see the note atop tables/schema.ts for
 * why generating the tables from the meta-schemas is not possible).
 *
 * Direction A: every property the meta-schema allows for an object kind must
 * exist in that kind's curated table for the version. Direction B: every
 * version-visible curated entry must be backed by the meta-schema.
 */

/**
 * Known, justified gaps between the curated tables and the vendored
 * meta-schemas, keyed by `${kind}/${version}`. Remove an entry here in the
 * same change that adds the property to its table. Do NOT add entries without
 * a comment explaining why the gap is intentional — this list should trend
 * toward empty, not grow.
 */
const KNOWN_MISSING_IN_TABLE: Record<string, ReadonlySet<string>> = {
  // The 3.0 meta-schema defines Header as a copy of the Parameter shape, so it
  // technically allows these two query-parameter-only fields. They are
  // meaningless for headers — OAI removed both from the Header Object in 3.1
  // (allowReserved returned deliberately in 3.2 and IS in the table) — so the
  // table deliberately never suggests them for 3.0 headers.
  'Header/3.0': new Set(['allowEmptyValue', 'allowReserved']),
};

/** Curated entries the meta-schema cannot enumerate, keyed the same way. */
const KNOWN_EXTRA_IN_TABLE: Record<string, ReadonlySet<string>> = {
  // `$ref` belongs to the Reference Object, not the Schema Object, so the 3.0
  // Schema definition does not list it. The table offers it anyway because a
  // schema position is exactly where authors type `$ref` — same reasoning as
  // the 3.1/3.2 Schema table, which has no meta-schema backing at all.
  'Schema/3.0': new Set(['$ref']),
};

type MetaSchema = Record<string, unknown>;

const META_SCHEMA_BY_VERSION: Record<OpenApiVersion, MetaSchema> = {
  '3.0': openapi30MetaSchema,
  '3.1': openapi31MetaSchema,
  '3.2': openapi32MetaSchema,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Resolves an internal `#/...` JSON-pointer reference against the schema root. */
function resolveRef(root: MetaSchema, ref: string): unknown {
  if (!ref.startsWith('#')) return undefined;
  let node: unknown = root;
  for (const rawSegment of ref.slice(1).split('/')) {
    if (!rawSegment) continue;
    const segment = rawSegment.replace(/~1/g, '/').replace(/~0/g, '~');
    if (!isRecord(node)) return undefined;
    node = node[segment];
  }
  return node;
}

/**
 * Collects every property name a schema node allows for the object it
 * describes: its own `properties` keys plus those contributed through
 * composition (`allOf`/`oneOf`/`anyOf`, `if`/`then`/`else`,
 * `dependentSchemas` values and internal `$ref`s). Never descends into a
 * property's value schema — that describes the child object, not sibling
 * keys. Refs to `specification-extensions` (the `^x-` idiom) are skipped.
 */
function collectProperties(
  node: unknown,
  root: MetaSchema,
  visited: Set<string>,
  out: Set<string>
): void {
  if (!isRecord(node)) return; // boolean schemas and non-objects contribute nothing

  if (isRecord(node.properties)) {
    for (const name of Object.keys(node.properties)) out.add(name);
  }

  for (const keyword of ['allOf', 'oneOf', 'anyOf'] as const) {
    const list = node[keyword];
    if (Array.isArray(list)) {
      for (const entry of list) collectProperties(entry, root, visited, out);
    }
  }

  for (const keyword of ['if', 'then', 'else'] as const) {
    if (keyword in node) collectProperties(node[keyword], root, visited, out);
  }

  if (isRecord(node.dependentSchemas)) {
    for (const dependent of Object.values(node.dependentSchemas)) {
      collectProperties(dependent, root, visited, out);
    }
  }

  if (typeof node.$ref === 'string') {
    const ref = node.$ref;
    if (!ref.endsWith('/specification-extensions') && !visited.has(ref)) {
      visited.add(ref);
      collectProperties(resolveRef(root, ref), root, visited, out);
    }
  }
}

/** Union of the properties collected from each entry-point pointer. */
function schemaProperties(version: OpenApiVersion, pointers: string[]): Set<string> {
  const root = META_SCHEMA_BY_VERSION[version];
  const out = new Set<string>();
  for (const pointer of pointers) {
    const node = pointer === '#' ? root : resolveRef(root, pointer);
    expect(node).toBeDefined(); // a wrong def pointer must fail loudly, not pass vacuously
    collectProperties(node, root, new Set(), out);
  }
  return out;
}

/**
 * Entry points per kind and version. `null` means the meta-schema has no
 * enumerable definition for that kind in that version:
 * - 3.1/3.2 `$defs/schema` is an opaque `$dynamicAnchor` stub (Schema Object
 *   keywords live in the JSON Schema 2020-12 vocabulary, not in the OAS
 *   meta-schema), and `discriminator`/`xml` have no defs at all.
 * Kinds with no curated table by design (dynamic-key containers) are absent:
 * Paths, Responses, Callback, SecurityRequirement, Unknown.
 */
const KIND_DEFS: {
  kind: OpenApiNodeKind;
  '3.0': string[] | null;
  '3.1': string[] | null;
  '3.2': string[] | null;
}[] = (() => {
  const d30 = (...names: string[]) => names.map((name) => `#/definitions/${name}`);
  const d3x = (...names: string[]) => names.map((name) => `#/$defs/${name}`);
  const same = (defs30: string[] | null, defs3x: string[] | null) =>
    ({ '3.0': defs30, '3.1': defs3x, '3.2': defs3x });

  return [
    { kind: 'Root', '3.0': ['#'], '3.1': ['#'], '3.2': ['#'] },
    { kind: 'Info', ...same(d30('Info'), d3x('info')) },
    { kind: 'Contact', ...same(d30('Contact'), d3x('contact')) },
    { kind: 'License', ...same(d30('License'), d3x('license')) },
    { kind: 'Tag', ...same(d30('Tag'), d3x('tag')) },
    { kind: 'ExternalDocs', ...same(d30('ExternalDocumentation'), d3x('external-documentation')) },
    { kind: 'Server', ...same(d30('Server'), d3x('server')) },
    { kind: 'ServerVariable', ...same(d30('ServerVariable'), d3x('server-variable')) },
    { kind: 'Components', ...same(d30('Components'), d3x('components')) },
    { kind: 'PathItem', ...same(d30('PathItem'), d3x('path-item')) },
    { kind: 'Operation', ...same(d30('Operation'), d3x('operation')) },
    {
      kind: 'Parameter',
      ...same(
        d30('Parameter', 'PathParameter', 'QueryParameter', 'HeaderParameter', 'CookieParameter'),
        d3x('parameter')
      ),
    },
    { kind: 'RequestBody', ...same(d30('RequestBody'), d3x('request-body')) },
    { kind: 'MediaType', ...same(d30('MediaType'), d3x('media-type')) },
    { kind: 'Encoding', ...same(d30('Encoding'), d3x('encoding')) },
    { kind: 'Response', ...same(d30('Response'), d3x('response')) },
    { kind: 'Header', ...same(d30('Header'), d3x('header')) },
    { kind: 'Example', ...same(d30('Example'), d3x('example')) },
    { kind: 'Link', ...same(d30('Link'), d3x('link')) },
    {
      kind: 'SecurityScheme',
      ...same(
        d30('APIKeySecurityScheme', 'HTTPSecurityScheme', 'OAuth2SecurityScheme', 'OpenIdConnectSecurityScheme'),
        d3x('security-scheme')
      ),
    },
    { kind: 'OAuthFlows', ...same(d30('OAuthFlows'), d3x('oauth-flows')) },
    {
      kind: 'OAuthFlow',
      '3.0': d30('ImplicitOAuthFlow', 'PasswordOAuthFlow', 'ClientCredentialsFlow', 'AuthorizationCodeOAuthFlow'),
      '3.1': d3x(
        'oauth-flows/$defs/implicit',
        'oauth-flows/$defs/password',
        'oauth-flows/$defs/client-credentials',
        'oauth-flows/$defs/authorization-code'
      ),
      '3.2': d3x(
        'oauth-flows/$defs/implicit',
        'oauth-flows/$defs/password',
        'oauth-flows/$defs/client-credentials',
        'oauth-flows/$defs/authorization-code',
        'oauth-flows/$defs/device-authorization'
      ),
    },
    { kind: 'Schema', ...same(d30('Schema'), null) },
    { kind: 'Discriminator', ...same(d30('Discriminator'), null) },
    { kind: 'XML', ...same(d30('XML'), null) },
  ];
})();

const VERSIONS: OpenApiVersion[] = ['3.0', '3.1', '3.2'];

/** Every checkable (kind, version, pointers) combination. */
const CASES = KIND_DEFS.flatMap((entry) =>
  VERSIONS.flatMap((version) => {
    const pointers = entry[version];
    return pointers ? [{ kind: entry.kind, version, pointers }] : [];
  })
);

describe('completion table ↔ meta-schema drift', () => {
  it.each(CASES)('$kind ($version) tables cover the meta-schema', ({ kind, version, pointers }) => {
    const fromSchema = schemaProperties(version, pointers);
    const fromTable = new Set(getCompletions(kind, version).map((entry) => entry.name));
    const allowed = KNOWN_MISSING_IN_TABLE[`${kind}/${version}`];

    const missing = [...fromSchema].filter((name) => !fromTable.has(name) && !allowed?.has(name));
    expect(
      missing.length === 0
        ? ''
        : `${kind} (${version}): meta-schema has properties not in the curated table: ${missing.join(', ')}`
    ).toBe('');
  });

  it.each(CASES)('$kind ($version) tables have no unbacked entries', ({ kind, version, pointers }) => {
    const fromSchema = schemaProperties(version, pointers);
    const allowed = KNOWN_EXTRA_IN_TABLE[`${kind}/${version}`];

    const extra = getCompletions(kind, version)
      .map((entry) => entry.name)
      .filter((name) => !fromSchema.has(name) && !allowed?.has(name));
    expect(
      extra.length === 0
        ? ''
        : `${kind} (${version}): curated table has entries the meta-schema does not back: ${extra.join(', ')}`
    ).toBe('');
  });

  it('fails loudly when an allowlist entry goes stale', () => {
    // Every allowlisted name must still be a real gap; otherwise the entry
    // must be deleted so the list cannot rot.
    for (const [key, names] of [
      ...Object.entries(KNOWN_MISSING_IN_TABLE),
      ...Object.entries(KNOWN_EXTRA_IN_TABLE),
    ]) {
      const [kind, version] = key.split('/') as [OpenApiNodeKind, OpenApiVersion];
      const entry = KIND_DEFS.find((candidate) => candidate.kind === kind);
      const pointers = entry?.[version];
      expect(pointers).toBeTruthy();
      const fromSchema = schemaProperties(version, pointers!);
      const fromTable = new Set(getCompletions(kind, version).map((item) => item.name));
      for (const name of names) {
        const isRealGap = fromSchema.has(name) !== fromTable.has(name);
        expect(
          isRealGap ? '' : `stale allowlist entry ${key}: ${name} is no longer a table/schema gap`
        ).toBe('');
      }
    }
  });
});
