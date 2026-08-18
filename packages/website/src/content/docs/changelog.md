---
title: Changelog
description: Release history for the Nouto VS Code extension.
---

Release history for the Nouto VS Code extension.

## 1.5.0

Released August 2026.

### OpenAPI Editor

Full editing support for OpenAPI 3.0, 3.1, and 3.2 specifications in YAML and JSON.

- Schema-aware autocomplete and hover documentation, gated by an IntelliSense setting
- Go-to-definition for `$ref` values, including references into other workspace files
- 60 lint rules across eleven groups (Security, Servers, Responses, Paths, Schemas, Components, OWASP, OpenAPI 3.2, Metadata, Policy, Opt-in), each with configurable severity
- One-click quick fixes for most lint rules and structural diagnostics
- Example validation against schemas (`example-invalid-schema` / `example-invalid-media`)
- Opt-in rules stay off until you pick a severity, so upgrades never enable new rules silently
- Outline tree view with editor sync, per-node context menus, method-colored operations, sort toggle, and parse-failure resilience
- Documentation preview with Swagger UI and RapiDoc, Try It proxied through the extension host to bypass CORS, and an open-in-browser live-refreshing snapshot
- Generate OpenAPI specs from collections or HAR files, and infer JSON Schema from response bodies
- Bundled Swagger Petstore example specs (3.0 and 3.2)

### JSON Explorer

- Query filter language with field comparisons (`=`, `!=`, `>`, `<`, `>=`, `<=`, `~`, `contains`, `startsWith`, `endsWith`) combined with `AND`, `OR`, `NOT`, and a slide-out Query Reference panel
- Compare against a pasted document or a file from disk
- Type generation: TypeScript, Zod, Rust, Go, Python, JSON Schema
- Statistics panel with key, object, array, and depth counts, type distribution, and unique key list
- Minimap with viewport indicator and click-to-scroll
- Pinned nodes with live value previews, persisted across sessions
- Timestamp detection for Unix seconds, Unix milliseconds, and ISO 8601
- Multi-select with bulk copy and bookmark actions
- Copy as CSV, TypeScript, Python, PHP array, or Markdown table
- Sort keys toggle, subtree extraction, embedded JSON detection
- JSONL / NDJSON support
- Schema validation panel
- User-toggleable per-column pinning in table view

### Other

- Sidebar three-dot menu with Environments, Settings, and About entries

### Fixed

- Invalid component key meta-schema errors now underline the key instead of the enclosing block
- Missing-path-param diagnostic now targets the operation key

## 1.4.0

Released April 2026.

### Added

- Faker data generation: 60+ `{{$faker.*}}` template variables for realistic mock data
- Prompt at send time: `{{$prompt.keyName}}` variables show a dialog to collect values before sending
- File read variables: `{{$file.read, /path/to/file}}` reads file content at send time
- Body editor autocomplete: typing `{{` in the JSON, Text, or XML body editor triggers variable autocomplete
- `Ctrl+Enter` to send from body editors
- JSON Explorer table view for nested arrays

### Fixed

- JSON validation errors no longer show when the body contains template variables

## 1.3.2

Released April 2026.

### Fixed

- Saved requests no longer open all at once in new tabs when the extension loads

## 1.3.0

Released April 2026.

### Added

- JSON Explorer sync: response body data is sent to the JSON Explorer panel when a request completes

### Fixed

- WebSocket disconnect error when the socket is still in CONNECTING state
- SSE duplicate key error on high-frequency streams
- WebSocket and GraphQL subscription handshake headers not being sent correctly
- SSE and WebSocket session recording and playback
- Default `User-Agent` header now sent for SSE, WebSocket, and GraphQL subscription connections

## 1.2.0

Released April 2026.

### Added

- Open `.json` files in JSON Explorer from the file explorer, editor tabs, or command palette
- Search and query in table view with cell highlighting, filter mode, and match navigation
- Double-click column auto-fit in table view
- Minimap click-and-drag scrolling
- JSONPath filter (`Ctrl+/`) and query (`Ctrl+Shift+K`) keyboard shortcuts
- Reorganized JSON Explorer toolbar with grouped buttons and split expand/collapse controls
- Expand/collapse all folders toggle in the sidebar toolbar

### Fixed

- "Create Assertion" and "Save as Variable" from JSON Explorer now work correctly
- Search and query match highlighting no longer obscured by row selection
- Context menu closes properly on outside click or Escape
- New Request (`Ctrl+N`) no longer opens a tab before the type picker

## 1.1.0

Released March 2026.

### Added

- Undo/redo system for request editing and collection operations
- Runner result export in JUnit XML and HTML formats
- Onboarding flow with a redesigned welcome screen, sample collection, and contextual hints
- Collection-scoped variables in benchmarks

### Fixed

- Benchmark now correctly substitutes collection-scoped and folder-scoped variables

## 1.0.0

Released March 2026. Initial public release.
