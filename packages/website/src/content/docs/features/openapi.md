---
title: OpenAPI Editor
description: Edit, validate, lint, and preview OpenAPI specs with a full Monaco-based editor, context-aware IntelliSense, and live documentation preview.
---

Nouto includes a dedicated OpenAPI specification editor built on the Monaco engine (the same editor that powers VS Code). Write or open any OpenAPI 3.0, 3.1, or 3.2 spec in YAML or JSON and get live linting, context-aware completions, hover documentation, go-to-definition, quick fixes, an outline navigator, and rendered API documentation in a side panel.

<!-- screenshot: openapi/editor-overview.png -->
![OpenAPI editor showing the spec on the left, the outline navigator, and the rendered preview on the right](/screenshots/openapi/editor-overview.png)

## Getting Started

1. Open an `.yaml` or `.json` OpenAPI spec file, or create a new one.
2. Start writing. The editor validates the document as you type and shows diagnostics inline.
3. Open the preview panel to see your spec rendered as interactive API documentation.

## Editing

The editor provides YAML and JSON syntax highlighting, per-tab undo/redo stacks, and automatic view state preservation (cursor position, scroll, folding) across tab switches. Theme and font settings sync from the app automatically.

See [Editor Basics](/openapi) for details.

## IntelliSense

A context-aware classifier identifies where your cursor sits in the spec (info block, operation, schema, parameter, security scheme, etc.) and suggests valid properties filtered by your OpenAPI version and keys already present. Value completions include enums and `$ref` targets, including references into other files.

Hover any property key for curated documentation. Use go-to-definition on `$ref` values to jump to the target, even across files.

See [IntelliSense](/openapi/intellisense) for details.

## Linting

Lint rules grouped by category (Security, Servers, Responses, Paths, Schemas, Metadata, Policy, Opt-in) check for common problems like missing error responses, unbounded parameters, plaintext server URLs, and unused component schemas. Each rule's severity is configurable as Off, Warning, or Error in Settings.

See [Linting](/openapi/linting) for the full rule reference.

## Diagnostics and Quick Fixes

Beyond lint rules, the editor runs structural and reference-integrity checks (duplicate operation IDs, missing path parameters, broken `$ref` targets) and validates the document against the version-specific OpenAPI JSON Schema. Most diagnostics, including nearly every lint rule, have one-click quick fixes that apply as a single undo step.

See [Diagnostics & Quick Fixes](/openapi/diagnostics) for the full list.

## Preview

Render your spec as interactive API documentation using Swagger UI or RapiDoc. The preview supports Auto, Light, and Dark themes, an operation picker for quick navigation, and a Try It button that converts any operation into a prefilled request tab. You can also generate a collection from the spec or open the rendered documentation in your system browser.

See [Preview](/openapi/preview) for details.

## Outline Navigator

A sidebar tree shows every section of your spec: servers, security schemes, tags, paths, operations, components, and webhooks. Click any node to jump to it in the editor. Nodes show HTTP method colors and component type icons. Right-click for edit actions or use Try It on any operation.

See [Outline Navigator](/openapi/outline) for details.

## External References

Enable cross-file `$ref` support to get completions, go-to-definition, and diagnostics that span multiple spec files. Editing a referenced file re-validates every document that depends on it.

See [External References](/openapi/external-refs) for details.

## Settings

Two settings control the editor's advanced features:

- **OpenAPI IntelliSense** — toggles completions, hover, and go-to-definition
- **OpenAPI External References** — toggles cross-file `$ref` resolution
