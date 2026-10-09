---
title: Changelog
description: Release history for the Nouto VS Code extension.
---

Release history for the Nouto VS Code extension. The desktop app and the standalone JSON Explorer extension keep separate changelogs on GitHub:

- [Desktop app changelog](https://github.com/frostybee/nouto/blob/main/packages/desktop/CHANGELOG.md)
- [JSON Explorer extension changelog](https://github.com/frostybee/nouto/blob/main/packages/json-explorer-ext/CHANGELOG.md)

## 1.6.4

Released October 2026.

### Fixed

- A request to a `localhost` port where nothing is listening shows **Connection refused** with the error text and a suggestion, instead of "An unknown error occurred". The collection runner, benchmarks, GraphQL schema fetches, OAuth token requests, and WebSocket and SSE connections also report the cause instead of an empty error
- **Try it** in the OpenAPI preview reports a failed connection as an error instead of an empty `200` response
- The GraphQL query editor no longer overlaps the Variables section when the request pane is short. The tab content scrolls instead

## 1.6.3

Released October 2026.

### Added

- An environment picker to switch the active environment. Open it from the status bar item that shows the active environment, the `{x}` icon in the API Testing view's title bar, or **Nouto: Select Environment**. Its **Manage Environments...** entry opens the Environments panel
- The **Nouto: Cookie Jars** command opens the Environments panel on the Cookie Jar tab

### Changed

- The toolbar above the New Request button is replaced by icons in the API Testing view's title bar: the environment picker, Cookie Jars, Mock Server, and Settings. The title bar also shows the name of the active environment

### Fixed

- The response panel shows the HTTP reason phrase for every status code, for example `406 Not Acceptable`, and the server's own phrase when it sends one ([#1](https://github.com/frostybee/nouto/issues/1))

## 1.6.2

Released October 2026.

### Changed

- Environments, Cookie Jars, Mock Server, and Settings moved from the vertical rail on the sidebar's left edge to a toolbar above the New Request button, so collections and history use the full sidebar width. About is still available from the view's `...` menu and from Settings
- The collection and folder context menus group the request types under a New Request submenu, and the collection menu groups the Postman, Nouto, and OpenAPI exports under an Export submenu. When the sidebar is too narrow to show a submenu beside the menu, the submenu opens in place with a back row

### Fixed

- Context menus in the sidebar are no longer cut off at the bottom of a short window. They stay inside the view and scroll when they are taller than it

## 1.6.1

Released September 2026.

### Changed

- The action bar, tab strip, and URL row are combined into one compact toolbar, with a breadcrumb that shows the request's collection path

### Fixed

- Sort and import dropdown menus in the Collections sidebar no longer render behind the panel
- Sort and import dropdown menus are centered under their buttons instead of right-aligned
- Variable autocomplete namespace labels use the badge foreground color for better contrast
- OpenAPI editor title buttons (Preview, Generate Collection, Open in Browser) no longer appear over webview panels

## 1.6.0

Released September 2026.

### OpenAPI editor

Editing support for OpenAPI 3.0, 3.1, and 3.2 specifications in YAML and JSON.

- Schema-aware autocomplete and hover documentation, controlled by an IntelliSense setting
- Go-to-definition for `$ref` values, including references into other workspace files
- 65 lint rules in eleven groups (Security, Servers, Responses, Paths, Schemas, Components, OWASP, OpenAPI 3.2, Metadata, Policy, Opt-in), each with a configurable severity
- Schema-aware ambiguous-path detection, which reduces false positives on endpoints that differ only by path parameter type
- One-click quick fixes for 41 of the 65 lint rules and for structural diagnostics
- Example validation against schemas (`example-invalid-schema` and `example-invalid-media`)
- Opt-in rules stay off until you pick a severity, so an upgrade never turns on a new opt-in rule
- Outline tree view with editor sync, per-node context menus, method-colored operations, a sort toggle, and an inline explanation when the spec fails to parse
- Documentation preview with Swagger UI and RapiDoc, Try It requests proxied through the extension host to avoid CORS errors, and a live-refreshing snapshot you can open in a browser
- Generate OpenAPI specs from collections or HAR files, and infer JSON Schema from response bodies
- **New OpenAPI Specification** command that opens a starter spec as an untitled document
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

- Collection runner reports gRPC, WebSocket, and SSE items as skipped instead of running them as HTTP

### Fixed

- Invalid component key meta-schema errors now underline the key instead of the enclosing block
- Missing-path-param diagnostic now targets the operation key
- Pasted URLs with leading or trailing whitespace no longer cause "Invalid URL" errors
- Template variables are now substituted in gRPC message bodies
- gRPC TLS key passphrase is now honored on the desktop app
- `google.protobuf.Any` types resolved via reflection in the gRPC client
- Proto-file schema generation fixed in the Node gRPC client

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

## 1.3.1

Released April 2026.

### Fixed

- Updated the README screenshot. No changes to the extension itself.

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
- Reset onboarding option in the Settings panel, which shows the hints and welcome screen again

### Fixed

- Benchmark now correctly substitutes collection-scoped and folder-scoped variables

## 1.0.0

Released March 2026. Initial public release.
