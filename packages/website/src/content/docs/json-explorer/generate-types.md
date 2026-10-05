---
title: Generate types
description: Generate TypeScript, Zod, Rust, Go, Python, and JSON Schema definitions from the JSON loaded in the JSON Explorer.
sidebar:
  order: 3
---

The JSON Explorer can turn the loaded JSON into type definitions that you paste into your code. It infers the shape of the data, including nested objects and array items, and renders it in the language you pick. Type generation works in the JSON Explorer extension and in the [JSON Explorer](/response/json-explorer) inside Nouto.

## Generate type definitions

1. Optional: select a node in the tree to generate types for that node only. The panel shows `Generating from:` and the path of the selected node. With no node selected, or with the root selected, the panel uses the whole document.
2. Click **Generate types** (the interface icon) in the explorer toolbar. The **Type Generator** panel opens with TypeScript output.
3. Click a language button at the top of the panel. The output updates immediately.
4. Click the copy button in the panel header to copy the output to the clipboard.

The panel follows your selection while it is open, so you can click different nodes to generate types for each one.

## Output by language

| Language | Output |
|----------|--------|
| TypeScript | An `interface` for each object. A `type` alias for arrays and primitive values at the root. |
| Zod | An `import { z } from 'zod'` line, an exported schema for each field that holds an object, a `rootSchema`, and `type Root = z.infer<typeof rootSchema>`. |
| Rust | A `pub struct` for each object with `#[derive(Debug, Serialize, Deserialize)]`. Field names are converted to snake_case, with `#[serde(rename = "...")]` when the JSON key differs. |
| Go | A `struct` for each object with PascalCase field names and `json:"key"` tags. |
| Python | A `@dataclass` class for each object, with field names converted to snake_case. |
| JSON Schema | A schema with `type`, `properties`, `items`, and a `required` list. |

The output contains only the definitions. Add the imports your project needs, such as `use serde::{Deserialize, Serialize};` for Rust or `from dataclasses import dataclass` for Python.

## How types are inferred

The generator works from the values in the loaded JSON, so the output describes this sample of the data:

- The root type is named `Root`. Nested types take the PascalCase form of their key, and array item types add `Item`, for example `OrdersItem`.
- The type of an array's items comes from the first item only. Make sure the first item is representative, or select a more representative node.
- An empty array becomes an array of an unknown type, such as `any[]` in TypeScript or `Vec<serde_json::Value>` in Rust.
- A `null` value becomes a nullable or untyped field, such as `any | null` in TypeScript or `Option<serde_json::Value>` in Rust.
- Whole numbers and decimals map to different types where the language has them, for example `i64` and `f64` in Rust, or `integer` and `number` in JSON Schema.
- The JSON Schema `required` list includes every key whose value is not `null`.

:::tip
For counts and type distribution rather than definitions, open the [Statistics](/response/json-explorer#statistics) panel.
:::
