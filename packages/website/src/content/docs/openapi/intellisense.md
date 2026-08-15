---
title: IntelliSense
description: Context-aware completions, hover documentation, and go-to-definition for OpenAPI specs.
sidebar:
  order: 1
---

The OpenAPI editor provides context-aware IntelliSense that understands the structure of your spec and offers relevant suggestions as you type. IntelliSense requires the **OpenAPI IntelliSense** setting to be enabled (on by default).

## Property Completions

A built-in classifier identifies the kind of node your cursor is in — info block, path item, operation, schema, response, parameter, security scheme, and more — and suggests valid properties for that context. Suggestions are filtered by:

- **OpenAPI version** — properties introduced in 3.1 or 3.2 only appear when the spec declares that version
- **Already-present keys** — properties you have already defined are excluded from suggestions

Completions insert structured scaffolds: object properties get a block-style YAML skeleton, arrays get an item placeholder, and enums offer a choice list.

## Trigger Characters

Completions activate automatically when you type any of these characters:

| Character | Context |
|-----------|---------|
| `:` | After a YAML key, to suggest values |
| ` ` (space) | After a colon or dash, to suggest values or items |
| `"` `'` | Inside quoted strings |
| `-` | At the start of a YAML list item |
| `/` | Inside a `$ref` path |
| `#` | Inside a `$ref` pointer (triggers internal ref suggestions) |

You can also trigger completions manually with `Ctrl+Space`.

## Value Completions

When a property accepts a fixed set of values (such as `type`, `in`, or `style`), the editor suggests the valid enum values. Select one to insert it.

## $ref Completions

When typing a `$ref` value, the editor suggests:

- **Internal references** — all components defined in the current spec (e.g. `#/components/schemas/User`)
- **Cross-file references** — when [External References](/openapi/external-refs) are enabled, typing a relative path like `./common.yaml#/` suggests the ref targets available in that file

Cross-file suggestions draw from the cached analysis of files your spec already references, without extra disk reads.

## Hover Documentation

Hover over any property key to see curated documentation in a tooltip. The documentation explains what the property does and its valid values, scoped to the node kind your cursor is in.

## Go to Definition

Hold `Ctrl` (or `Cmd` on macOS) and click a `$ref` value to navigate to the referenced component:

- **Internal refs** (e.g. `#/components/schemas/User`) — jumps to the target within the same file
- **External refs** (e.g. `./common.yaml#/components/schemas/Address`) — opens the referenced file and reveals the target. Requires [External References](/openapi/external-refs) to be enabled
