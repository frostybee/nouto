---
title: IntelliSense
description: Context-aware completions, hover documentation, and go to definition for OpenAPI specs in Nouto.
sidebar:
  order: 1
---

The OpenAPI editor suggests the properties and values that are valid at the cursor, shows documentation when you hover over a key, and jumps from a `$ref` to its target. Completions and hover documentation run while **Enable OpenAPI IntelliSense** is on in **Settings** > **OpenAPI**. The setting is on by default. Go to definition for references inside the same file works with the setting off.

## Property completions

Nouto works out which kind of OpenAPI object the cursor is in, such as an info block, path item, operation, parameter, response, schema, or security scheme, and suggests the properties that object accepts. The list leaves out:

- Properties added in a later OpenAPI version than the one your spec declares. For example, the 3.2 properties `$self`, `additionalOperations`, `itemSchema`, and the tag fields `summary`, `parent`, and `kind` only appear when the spec declares `openapi: 3.2.x`.
- Properties the object already contains.

Selecting a completion also inserts a scaffold for its value. In YAML, an object property inserts an indented block and an array property inserts a first list item, and a property with a fixed set of values offers those values as a choice.

## Value completions

When a property accepts a fixed set of values, such as `type`, `in`, or `style`, Nouto suggests those values. Values follow the same version rule as properties: `in: querystring` only appears in 3.2 specs.

## `$ref` completions

Inside a `$ref` value, Nouto suggests targets that fit the surrounding object. A `$ref` in a schema suggests entries from `components/schemas`, and a `$ref` in a parameter suggests entries from `components/parameters`.

- Internal references come from the current file, for example `#/components/schemas/User`.
- Cross-file references require **Resolve external $refs**. Nouto suggests `./file.yaml#/...` targets from files your spec already references. After you type a file path followed by `#`, such as `./common.yaml#`, it suggests the targets inside that file. See [External references](/openapi/external-refs).

## Trigger characters

Completions open automatically after you type one of these characters. Press `Ctrl+Space` to open them anywhere else.

| Character | Typical context |
|-----------|-----------------|
| `:` | After a key, to suggest values |
| Space | After a colon or a list dash |
| `"` or `'` | Inside a quoted string |
| `-` | At the start of a YAML list item |
| `/` | Inside a `$ref` path |
| `#` | Inside a `$ref`, before the JSON Pointer |

In VS Code, starting a new line also opens completions.

## Hover documentation

Hover over a property key to see what the property does and which values it accepts. The text depends on the object the key belongs to, so `description` on an operation and `description` on a schema show different documentation.

## Go to definition

Hold `Ctrl` (`Cmd` on macOS) and click a `$ref` value to jump to its target. In VS Code, `F12` also works.

- An internal reference such as `#/components/schemas/User` moves the cursor to the target in the same file.
- An external reference such as `./common.yaml#/components/schemas/Address` opens the referenced file and reveals the target. This requires **Resolve external $refs**. The desktop app opens the file in its own tab, or switches to that tab if the file is already open.
