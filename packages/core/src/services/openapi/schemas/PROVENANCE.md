# Vendored OpenAPI Meta-Schemas — Provenance

The TypeScript modules in this directory are generated from the official
OpenAPI Initiative meta-schemas by
`packages/core/vendor/openapi-schemas/vendor.mjs`. Do not edit them by hand —
re-run the script instead (`node vendor.mjs --fetch` to re-download, then
update this file with the printed checksums and the new retrieval date).

## Sources

| Artifact | Source URL (immutable dated iteration) | Retrieved | SHA-256 of raw download |
|---|---|---|---|
| `openapi-3.0-schema.ts` | <https://spec.openapis.org/oas/3.0/schema/2024-10-18> | 2026-07-20 | `2385f5bbb8c37878daae73baeabe7f34b2f022a4a8c049329ee61f71796f039c` |
| `openapi-3.1-schema.ts` | <https://spec.openapis.org/oas/3.1/schema/2025-09-15> | 2026-07-20 | `d0a3955182364c7b5fdebfd0583ecad259a870b4a2fe86a1b0fe8785f8224fed` |
| `openapi-3.1-schema-editor.ts` | derived from the 3.1 source above (see transform) | 2026-07-20 | n/a (generated) |

The raw, untouched downloads are kept for diffing at
`packages/core/vendor/openapi-schemas/*.raw.json`.

Dated iterations published under `spec.openapis.org/oas/<version>/schema/<date>`
are immutable by OpenAPI Initiative policy — schema fixes are published as new
dated iterations.

## Editor-variant transform (3.1 only)

The upstream 3.1 meta-schema is JSON Schema draft 2020-12 and uses one
`"$dynamicAnchor": "meta"` (on `$defs/schema`) with four
`"$dynamicRef": "#meta"` references to it. The in-editor validation pipeline
(`codemirror-json-schema` → `json-schema-library`) only implements JSON Schema
draft-04/06/07 and cannot evaluate dynamic references, so the editor variant
rewrites:

- every `{"$dynamicRef": "#meta"}` → `{"$ref": "#/$defs/schema"}`
- `"$dynamicAnchor": "meta"` on `$defs/schema` → removed

This is semantically equivalent when the meta-schema is used self-contained
(no extension dialect re-binds the anchor), which is how Nouto uses it. Other
2020-12 keywords (`unevaluatedProperties`, `dependentSchemas`,
`propertyNames`, …) are left intact. The unmodified schema is used for exact
host-side validation via Ajv2020.

### Verified in-editor validation limits (Phase 0 result)

Empirical verification against `codemirror-json-schema@0.7.9` /
`json-schema-library@9.3.5` (see
`packages/ui/src/lib/codemirror/schema-pipeline.test.ts`):

- **3.1 editor variant:** loads and lints without throwing, but validation is
  **inert** — the root schema keeps a `$ref` sibling next to
  `properties`/`required`, and under the library's draft-04 semantics a
  `$ref` sibling swallows every other keyword, so no diagnostics are ever
  produced.
- **3.0 schema:** `json-schema-library` **throws at compile time**
  ("Mutiple typeIds [not, oneOf]") on schema objects that combine `not` and
  `oneOf`.

Consequence: in-editor `'schema'`-source diagnostics for OpenAPI documents
must come from host-side Ajv validation (`validateOpenApiMetaSchema`) routed
over the transport. The editor pipeline's schema wiring remains valuable for
plain user-supplied JSON Schemas (e.g. gRPC panel) and for
completion/hover experiments, and `templateAwareLinter` suppresses a
throwing/inert schema linter so editing never breaks.

The OpenAPI 3.0 meta-schema is natively JSON Schema draft-04 and needs no
variant. Note it uses draft-04's boolean `exclusiveMinimum` form, which Ajv v8
proper cannot compile — host-side validation for 3.0 uses the official
`ajv-draft-04` companion package.

## License

The OpenAPI Specification and its meta-schemas are © the OpenAPI Initiative /
The Linux Foundation, licensed under the Apache License, Version 2.0
(<https://www.apache.org/licenses/LICENSE-2.0>). See
<https://github.com/OAI/OpenAPI-Specification/blob/main/LICENSE>.
