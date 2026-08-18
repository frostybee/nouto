---
title: OpenAPI Editor
description: Monaco-based editor for OpenAPI specs with YAML/JSON support, per-tab undo, and theme sync.
sidebar:
  order: 0
---

The OpenAPI editor uses the Monaco engine (the same editor that powers VS Code) to provide a full editing experience for OpenAPI specification documents in YAML or JSON format.

## Opening a Spec

Open any `.yaml`, `.yml`, or `.json` file that contains an OpenAPI specification. Nouto detects the `openapi` version field and activates the editor features automatically.

## Editing

The editor provides:

- YAML and JSON syntax highlighting
- Per-tab undo and redo stacks; each open spec gets its own history
- View state preservation across tab switches (cursor position, scroll offset, code folding)
- Inline diagnostic markers for errors and warnings as you type

## Saving

Press `Ctrl+S` (Windows/Linux) or `Cmd+S` (macOS) to save the current spec.

## Appearance

The editor theme syncs from the app theme automatically and refreshes when you switch themes. Font size and font family follow the app font settings.

## Supported OpenAPI Versions

The editor supports OpenAPI 3.0, 3.1, and 3.2 specifications. Version-specific features adapt automatically:

- **3.0**: the baseline, with full support for paths, components, and security schemes
- **3.1**: adds webhooks, JSON Schema alignment, and `pathItems` in components
- **3.2**: the latest version, with full Swagger UI preview support

IntelliSense completions filter by version, so you only see properties valid for the version declared in your spec.

## What's Next

- [IntelliSense](/openapi/intellisense): completions, hover, go-to-definition
- [Linting](/openapi/linting): 15 configurable rules across 7 groups
- [Diagnostics & Quick Fixes](/openapi/diagnostics): validation and one-click fixes
- [Preview](/openapi/preview): rendered API documentation
- [Outline Navigator](/openapi/outline): sidebar tree navigation
- [External References](/openapi/external-refs): cross-file `$ref` support
- [Generate from Collections](/openapi/generate-from-collections): create a YAML OpenAPI specification from a collection
