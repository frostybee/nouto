---
title: External References
description: Cross-file $ref resolution with completions, go-to-definition, and live diagnostics across multi-file OpenAPI specs.
sidebar:
  order: 6
---

OpenAPI specs often split definitions across multiple files using `$ref` with relative paths. When the **OpenAPI External References** setting is enabled, the editor resolves these cross-file references and extends IntelliSense, diagnostics, and navigation to work across your entire spec.

## What's Resolved

With external references enabled, the editor provides:

- **Cross-file completions** — when typing a `$ref` value like `./common.yaml#/`, the editor suggests ref targets available in that file
- **Cross-file go-to-definition** — `Ctrl+Click` (`Cmd+Click` on macOS) on an external `$ref` opens the referenced file and reveals the target
- **Cross-file diagnostics** — broken external refs produce diagnostics with the exact target path. Editing a referenced file re-validates every open document that depends on it, so diagnostics stay current as you work across files

## Referenced Files in the Outline

When external references are enabled, the [Outline Navigator](/openapi/outline) adds a **Referenced Files** group. This group lists every file your spec references via `$ref`, with child nodes for each distinct target pointer. Files that cannot be resolved show an error icon.

## Fixing Broken External References

Two quick fixes help repair broken cross-file references (VS Code only):

- **Create missing file** — when a `$ref` points to a file that does not exist, the fix creates it and seeds it with the expected component if the ref targets one directly
- **Create missing component** — when the file exists but the target pointer does not, the fix creates the missing component in that file

See [Diagnostics & Quick Fixes](/openapi/diagnostics) for the complete list of available fixes.

## Enabling External References

External reference support is controlled by the **OpenAPI External References** setting. It is independent of the IntelliSense setting: you can have IntelliSense on with external refs off, or both on.
