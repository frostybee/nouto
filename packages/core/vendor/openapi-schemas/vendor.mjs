#!/usr/bin/env node
/**
 * Regenerates the vendored OpenAPI meta-schema TypeScript modules in
 * packages/core/src/services/openapi/schemas/ from the raw JSON files in
 * this directory.
 *
 * Usage:
 *   node vendor.mjs           # regenerate .ts modules from the raw JSON on disk
 *   node vendor.mjs --fetch   # re-download the pinned schemas first, then regenerate
 *
 * After running with --fetch, update PROVENANCE.md with the printed checksums
 * and the new retrieval date.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '../../src/services/openapi/schemas');

const SOURCES = [
  {
    url: 'https://spec.openapis.org/oas/3.0/schema/2024-10-18',
    raw: 'openapi-3.0-schema.raw.json',
  },
  {
    url: 'https://spec.openapis.org/oas/3.1/schema/2025-09-15',
    raw: 'openapi-3.1-schema.raw.json',
  },
];

if (process.argv.includes('--fetch')) {
  for (const { url, raw } of SOURCES) {
    const res = await fetch(url, { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
    writeFileSync(join(here, raw), await res.text(), 'utf8');
    console.log(`Fetched ${url} -> ${raw}`);
  }
}

/**
 * Produce the "editor variant" of the 3.1 meta-schema: the OpenAPI 3.1 schema
 * uses one `$dynamicAnchor: "meta"` (on `$defs/schema`) and four
 * `$dynamicRef: "#meta"` references to it. Draft-04-only validators (the
 * codemirror-json-schema / json-schema-library pipeline) do not understand
 * dynamic references, so this rewrites them to equivalent static local refs.
 * Semantically equivalent as long as the meta-schema is used self-contained
 * (no extension dialect re-binding the anchor), which is how Nouto uses it.
 */
function toEditorVariant(node) {
  if (Array.isArray(node)) return node.map(toEditorVariant);
  if (node === null || typeof node !== 'object') return node;
  const out = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === '$dynamicRef' && value === '#meta') {
      out['$ref'] = '#/$defs/schema';
    } else if (key === '$dynamicAnchor' && value === 'meta') {
      // dropped: the anchor's only purpose is to be the $dynamicRef target
    } else {
      out[key] = toEditorVariant(value);
    }
  }
  return out;
}

function tsModule({ url, constName, doc, schema }) {
  return `// GENERATED FILE — do not edit by hand.
// Regenerate with: node packages/core/vendor/openapi-schemas/vendor.mjs
// Source: ${url} (see PROVENANCE.md)

/** ${doc} */
export const ${constName}: Record<string, unknown> = ${JSON.stringify(schema, null, 2)};
`;
}

const schema30 = JSON.parse(readFileSync(join(here, 'openapi-3.0-schema.raw.json'), 'utf8'));
const schema31 = JSON.parse(readFileSync(join(here, 'openapi-3.1-schema.raw.json'), 'utf8'));
const schema31Editor = toEditorVariant(schema31);
schema31Editor['$comment'] =
  'Nouto editor variant: $dynamicRef/$dynamicAnchor rewritten to static refs for draft-04-level validators. See PROVENANCE.md.';

const outputs = [
  {
    file: 'openapi-3.0-schema.ts',
    content: tsModule({
      url: SOURCES[0].url,
      constName: 'openapi30MetaSchema',
      doc: 'OpenAPI 3.0.x meta-schema (JSON Schema draft-04).',
      schema: schema30,
    }),
  },
  {
    file: 'openapi-3.1-schema.ts',
    content: tsModule({
      url: SOURCES[1].url,
      constName: 'openapi31MetaSchema',
      doc: 'OpenAPI 3.1.x meta-schema (JSON Schema 2020-12). Host-side Ajv2020 use only.',
      schema: schema31,
    }),
  },
  {
    file: 'openapi-3.1-schema-editor.ts',
    content: tsModule({
      url: `${SOURCES[1].url} (transformed)`,
      constName: 'openapi31MetaSchemaEditor',
      doc: 'OpenAPI 3.1.x meta-schema, editor variant: $dynamicRef/$dynamicAnchor rewritten to static refs for the in-editor draft-04-level validation pipeline.',
      schema: schema31Editor,
    }),
  },
];

for (const { file, content } of outputs) {
  writeFileSync(join(outDir, file), content, 'utf8');
  console.log(`Wrote ${join(outDir, file)}`);
}

for (const { raw } of SOURCES) {
  const buf = readFileSync(join(here, raw));
  console.log(`sha256(${raw}) = ${createHash('sha256').update(buf).digest('hex')}`);
}
