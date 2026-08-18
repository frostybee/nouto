---
title: Diagnostics & Quick Fixes
description: Structural validation, reference-integrity checks, meta-schema validation, and one-click fixes for OpenAPI specs.
sidebar:
  order: 3
---

The OpenAPI editor runs multiple layers of validation as you type and surfaces problems as inline diagnostics. Many diagnostics have one-click quick fixes that apply as a single undo step.

## Semantic Diagnostics

These structural and reference-integrity checks run automatically on every edit. They are always on and not configurable.

| Diagnostic | Description |
|------------|-------------|
| `missing-root-sections` | The spec is missing a required root-level `paths` object |
| `unused-path-param` | A path parameter is defined but does not appear in the path template |
| `additional-op-duplicate` | Duplicate additional operation in the same path item |
| `duplicate-operation-id` | The same `operationId` is used on multiple operations |
| `missing-path-param` | The path template contains `{param}` but no matching parameter definition exists |
| `ref-not-found` | A `$ref` target does not exist in the document or referenced file |

## Meta-Schema Validation

The editor validates your spec against the official OpenAPI JSON Schema for the declared version (3.0, 3.1, or 3.2). This catches structural issues like invalid property names, wrong value types, and missing required fields. Validation is skipped for approximate or unreleased versions to avoid false positives on new fields.

## Validation Pipeline

Diagnostics run in two passes, debounced at 400ms after each edit:

1. **Sync pass**: syntax errors, semantic diagnostics, meta-schema validation, and [lint rules](/openapi/linting) all run immediately (in VS Code the example-vs-schema rules run here too)
2. **Async pass**: resolves cross-file `$ref` targets and updates diagnostics from [external references](/openapi/external-refs); in the desktop app, meta-schema validation and the example-vs-schema lint rules run on the Rust side and merge in here

Editing a referenced file re-validates every open document that depends on it. Changing linting settings triggers immediate re-validation of all open specs without requiring an edit.

## Structural Quick Fixes

These fixes resolve semantic diagnostics. Click the lightbulb icon or press `Ctrl+.` (`Cmd+.` on macOS) to apply.

| Diagnostic | Fix |
|------------|-----|
| `missing-root-sections` | Add an empty `paths` object |
| `duplicate-operation-id` | Rename to a unique `operationId` |
| `unused-path-param` | Remove the unused path parameter |
| `missing-path-param` | Add a path parameter skeleton for the missing `{param}` |
| `ref-not-found` | Create the missing component under `components/<section>/<name>`, seeded with a preset |

The `ref-not-found` fix applies only to internal refs that target a `components` path (e.g. `#/components/schemas/User`).

## Lint Rule Quick Fixes

Most [lint rules](/openapi/linting) also have a one-click fix (the Fix column on the Linting page says which):

| Rule | Fix |
|------|-----|
| `api-key-in-query` | Move the API key to `in: header` |
| `server-uses-http` | Rewrite the server URL to `https://` |
| `server-url-has-credentials` | Strip the `user:pass@` userinfo from the server URL |
| `operation-missing-4xx` | Add a `default` response with a placeholder description |
| `operation-missing-5xx` | Add a `default` response (deduplicated with the 4xx fix if both fire) |
| `parameter-unbounded` | Add `maxLength: 255` for string parameters, or `maxItems: 100` for arrays |
| `schema-unconstrained-additional-properties` | Set `additionalProperties: false` |
| `missing-info-description` | Add an `info.description` derived from the title |
| `operation-missing-description` | Add a `summary` derived from the operationId or path |
| `operation-missing-tags` | Add a tag derived from the first static path segment |
| `operation-missing-operation-id` | Add an `operationId` derived from the HTTP method and path |
| `operation-without-security` | Require one of the document's security schemes for this operation, or for all operations |
| `unused-component-schema` | Remove the unused schema |
| `rate-limit-headers` | Add `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` headers to inline 2xx responses |
| `info-missing-contact` | Add `info.contact` with a placeholder name |
| `info-missing-license` | Add `info.license` (Apache 2.0) |
| `operation-tag-undefined` | Declare the tag in the root `tags` list (one action per tag name) |
| `tag-duplicate-name` | Remove the later duplicate tag entry |
| `tag-missing-description` | Add a description derived from the tag name |
| `operation-duplicate-parameter` | Remove the duplicate parameter entry |
| `path-key-trailing-slash` | Rename the path key without the trailing slash |
| `path-key-has-query` | Rename the path key without the query string |
| `server-url-trailing-slash` | Remove the trailing slash from the server URL |
| `servers-empty` | Add a placeholder server entry |
| `server-variable-undefined` | Declare the missing server variable (one action per variable) |
| `enum-duplicate-values` | Remove every duplicate value from the enum in one edit |
| `schema-required-property-undefined` | Define the property with a `string` stub, or remove it from `required` |
| `schema-nullable-in-31` | Replace `nullable: true` with a `"null"` entry in `type` and remove the keyword |
| `ref-has-siblings` | Remove the keys next to `$ref` |
| `example-value-and-external-value` | Remove `externalValue` and keep `value` |
| `unused-component` | Remove the unused component |
| `owasp-integer-unbounded` | Add the missing `minimum`/`maximum` placeholders |
| `owasp-integer-no-format` | Add `format: int64` |
| `owasp-string-unrestricted` | Add `maxLength: 255` |
| `owasp-array-unbounded` | Add `maxItems: 100` |
| `owasp-response-401-missing` | Add an explicit `401` response |
| `owasp-response-429-missing` | Add an explicit `429` response with a `Retry-After` header |
| `owasp-response-500-missing` | Add an explicit `500` response |
| `owasp-429-retry-after` | Add a `Retry-After` header to the 429 response |
| `owasp-jwt-best-practices` | Append an RFC 8725 note to the scheme description |
| `owasp-unsafe-operation-unprotected` | Require one of the document's security schemes for the operation or globally |

Lint fixes skip `$ref` parameters, schemas, and responses to avoid surprising side effects on shared definitions.

## Cross-File Quick Fixes

These fixes are available in VS Code when [External References](/openapi/external-refs) are enabled:

| Diagnostic | Fix |
|------------|-----|
| `external-file-not-found` | Create the missing file, seeded with the expected component if the ref targets one directly |
| `external-pointer-not-found` | Create the missing component in the referenced file |
