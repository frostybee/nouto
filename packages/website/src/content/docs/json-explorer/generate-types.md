---
title: Generate Types
description: Generate TypeScript, Zod, Rust, Go, Python, and JSON Schema definitions from JSON loaded in the explorer.
sidebar:
  order: 3
---

Click **Generate Types** in the explorer toolbar to turn the loaded JSON into type definitions. The panel infers the shape of the data, including nested objects and array element types, and renders the result for the language you pick.

## Supported outputs

| Output | Produces |
|--------|----------|
| TypeScript | `interface` declarations, with `type` aliases for arrays and primitives |
| Zod | A `z.object` schema plus an inferred TypeScript type |
| Rust | `pub struct` definitions |
| Go | `type ... struct` definitions |
| Python | `@dataclass` class definitions |
| JSON Schema | A JSON Schema document |

Switch languages with the buttons at the top of the panel; the output regenerates immediately.

## Scoping the output

With no node selected, types are generated for the whole document. Select a node in the tree first to generate types for just that subtree, which is useful for pulling a single nested object out of a large response.

## Copying the result

Use the copy button in the panel header to copy the generated output to the clipboard, then paste it into your project.

:::tip
Looking for counts and type distribution rather than definitions? See the [Statistics](/response/json-explorer#statistics) panel.
:::
