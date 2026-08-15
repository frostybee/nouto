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

1. **Sync pass** — syntax errors, semantic diagnostics, meta-schema validation, and [lint rules](/openapi/linting) all run immediately
2. **Async pass** — resolves cross-file `$ref` targets and updates diagnostics from [external references](/openapi/external-refs)

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

Six [lint rules](/openapi/linting) also have one-click fixes:

| Rule | Fix |
|------|-----|
| `operation-missing-4xx` | Add a `default` response with a placeholder description |
| `operation-missing-5xx` | Add a `default` response (deduplicated with the 4xx fix if both fire) |
| `parameter-unbounded` | Add `maxLength: 255` for string parameters, or `maxItems: 100` for arrays |
| `schema-unconstrained-additional-properties` | Set `additionalProperties: false` |
| `operation-missing-tags` | Add a tag derived from the first static path segment |
| `operation-missing-operation-id` | Add an `operationId` derived from the HTTP method and path |

Lint fixes skip `$ref` parameters and schemas to avoid surprising side effects on shared definitions.

## Cross-File Quick Fixes

These fixes are available in VS Code when [External References](/openapi/external-refs) are enabled:

| Diagnostic | Fix |
|------------|-----|
| `external-file-not-found` | Create the missing file, seeded with the expected component if the ref targets one directly |
| `external-pointer-not-found` | Create the missing component in the referenced file |
