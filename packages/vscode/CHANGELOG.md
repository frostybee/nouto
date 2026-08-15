# Changelog

All notable changes to the Nouto VS Code extension will be documented in this file.

## [1.5.0] - 2026-08-15

### Added

- **OpenAPI editing** for 3.0 / 3.1 / 3.2 documents (YAML and JSON): diagnostics with syntax, meta-schema, and lint checks plus quick fixes, schema-aware completion and hover documentation gated by an IntelliSense setting, and scaffolding of required child keys in completions
- **OpenAPI go-to-definition**: Ctrl+hover or F12 on a `$ref` value jumps to the referenced node, with the full reference value underlined; works for internal pointers and refs into other workspace files
- **OpenAPI external refs**: `./file.yaml#/Pointer` references to local workspace files resolve across diagnostics, go-to-definition, and the bundled preview
- **OpenAPI documentation preview**: sandboxed preview panel with Swagger UI and RapiDoc renderers, Try It execution proxied through the extension host to avoid CORS limits, Generate Collection, and an open-in-browser live-refreshing snapshot
- **OpenAPI outline**: tree view with editor sync, per-node context menus for add/delete/copy-pointer spec editing, method-colored Try It operations, a sort toggle, and a welcome view with Open and Create actions
- **OpenAPI generation**: build an OpenAPI contract from a collection or HAR file via the collection context menu, and infer JSON Schema from response bodies with copy and add-to-spec actions
- **New OpenAPI spec command**: scaffold a new specification as an untitled document from a starter template
- **Example OpenAPI specifications**: open a bundled Swagger Petstore spec (OpenAPI 3.0 or 3.2) as an untitled document from the command palette, the outline menu, or the outline welcome view
- **JSON Explorer query filter**: filter the tree and table with a field comparison language (`=`, `!=`, `>`, `<`, `>=`, `<=`, `~` regex, `contains`, `startsWith`, `endsWith`, combined with `AND`, `OR`, `NOT`, and parentheses) opened with `Ctrl+Shift+K`, with a slide-out Query Reference panel and next/previous match navigation
- **JSON Explorer compare**: diff the loaded document against a second JSON document pasted into the compare dialog, with an added/removed/changed/unchanged summary, separate from the response diff, which compares a response against the previous response for the same request
- **JSON Explorer type generation**: produce TypeScript, Zod, Rust, Go, Python, or JSON Schema definitions from the whole document or the selected node
- **JSON Explorer statistics**: key, object, array, depth, and value counts with a type distribution breakdown, array and string length stats, and a unique key list
- **JSON Explorer minimap**: canvas overview of the document with a viewport indicator and click to scroll, shown for documents with more than 20 visible nodes
- **JSON Explorer pinned nodes**: pin nodes into an always visible Pinned strip with live value previews, separate from the Bookmarks panel and persisted across sessions
- **JSON Explorer timestamp detection**: Unix seconds, Unix milliseconds, and ISO 8601 values show an inline formatted date hint and hover tooltip in tree rows and table cells
- **JSON Explorer multi-select**: `Ctrl`/`Cmd`+click, `Shift`+click range selection, `Ctrl+A`, and `Escape`, with a selection count in the status bar and bulk copy and bookmark actions in the context menu
- **JSON Explorer copy formats**: copy as CSV, TypeScript, Python, PHP array, or Markdown table in addition to JSON and YAML, plus a Save to File action for JSON, YAML, and CSV
- **JSON Explorer sort keys toggle**: toolbar button that reorders object keys alphabetically in the tree view without touching the document
- **JSON Explorer subtree extraction**: right-click any object or array and open it as its own explorer panel, titled with the node path
- **JSON Explorer embedded JSON detection**: string values containing a JSON object or array show an inline badge, with a context-menu action to open the parsed value in a new panel
- **JSON Explorer JSONL / NDJSON support**: NDJSON response bodies parse as arrays, and `.jsonl` / `.ndjson` files can be opened via the Open in JSON Explorer command
- **JSON Explorer compare from file**: a "Choose file..." button in the compare dialog picks a JSON file from disk alongside the existing paste flow
- **JSON Explorer schema validation**: paste a JSON Schema into the new schema panel to validate the document; failing nodes are marked in the tree, the error panel lists path and message per violation with click-to-navigate

### Changed

- **JSON Explorer table pinning**: replaced the fixed first data column with user-toggleable per-column pinning, and added a dedicated CSV export button and timestamp hints in cells

## [1.4.0] - 2026-04-15

### Added

- **Faker data generation**: 60+ `{{$faker.*}}` template variables for realistic mock data (names, emails, addresses, phone numbers, and more) powered by Faker
- **Prompt at send time**: `{{$prompt.keyName}}` variables show a dialog to collect values before sending, used once and not saved
- **File read variables**: `{{$file.read, /path/to/file}}` reads file content at send time and substitutes it inline
- **Body editor autocomplete**: typing `{{` in the JSON, Text, or XML body editor now triggers variable autocomplete with environment variables, dynamic variables, and faker functions
- **Ctrl+Enter to send from body editor**: send requests directly while editing the body without switching focus
- **JSON Explorer table view for nested arrays**: view nested arrays as a table in the JSON Explorer panel

### Fixed

- JSON validation errors no longer show when the body contains template variables (`{{...}}`)

## [1.3.2] - 2026-04-13

### Fixed

- Saved requests no longer open all at once in new tabs when the extension loads

## [1.3.1] - 2026-04-08

### Fixed

- Updated README screenshot

## [1.3.0] - 2026-04-08

### Added

- **JSON Explorer sync**: response body data is automatically sent to the JSON Explorer panel when a request completes

### Fixed

- WebSocket disconnect error when the socket is still in CONNECTING state
- SSE duplicate key error on high-frequency streams (e.g., Wikimedia)
- WebSocket and GraphQL subscription handshake headers not being sent correctly
- SSE and WebSocket session recording and playback
- Default `User-Agent` header now sent for SSE, WebSocket, and GraphQL subscription connections

## [1.2.0] - 2026-04-02

### Added

- **Open .json files in JSON Explorer** from the file explorer, editor tabs, or command palette
- **Search and query in table view** with cell highlighting, filter mode, and match navigation
- **Double-click column auto-fit** in table view
- **Minimap click-and-drag** scrolling
- **New keyboard shortcuts**: JSONPath filter (Ctrl+/), query (Ctrl+Shift+K)
- **Reorganized JSON Explorer toolbar** with grouped buttons and split expand/collapse controls
- **Expand/collapse all folders** toggle in the sidebar toolbar

### Fixed

- "Create Assertion" and "Save as Variable" from JSON Explorer now work correctly
- Search and query match highlighting no longer obscured by row selection
- Context menu closes properly on outside click or Escape
- New Request (Ctrl+N) no longer opens a tab before the type picker

## [1.1.0] - 2026-03-25

### Added

- **Undo/redo system** for request editing and collection operations
- **Runner result export** in JUnit XML and HTML formats
- **Onboarding flow** with a redesigned welcome screen, sample collection (httpbin.org examples), and contextual hints for new users
- **Collection-scoped variables in benchmarks**, resolving variables from the collection and folder hierarchy
- **Reset onboarding** option in the Settings panel to re-show hints and the welcome screen

### Fixed

- Benchmark now correctly substitutes collection-scoped and folder-scoped variables
- Various UI improvements and bug fixes

## [1.0.0] - 2026-03-23

Initial public release.

### Features

- **HTTP requests** with support for all methods (GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS, and custom methods)
- **Collections** with unlimited folder nesting, drag-and-drop reordering, and batch operations (multi-select, bulk delete/move)
- **Environment variables** with `{{variable}}` substitution in URL, params, headers, body, and auth fields
- **Dynamic variables**: `{{$uuid.v4}}`, `{{$timestamp.unix}}`, `{{$random.int}}`, and more
- **Request history** with sidebar tab, stats dashboard, and export/import
- **GraphQL** support with schema introspection, queries, mutations, and subscriptions
- **WebSocket** support with session recording and replay
- **Server-Sent Events (SSE)** support
- **gRPC** support with unary calls, streaming, proto file loading, and server reflection
- **Collection runner** with pre/post-request scripts, flow control, and iteration support
- **Assertions engine** for automated response validation
- **Mock server** for local API simulation
- **Benchmarking** with configurable iterations, concurrency, and latency histograms
- **Code generation** for multiple languages (cURL, JavaScript, Python, Go, and more)
- **Collection import** from Postman, Insomnia, Thunder Client, HAR, and OpenAPI/Swagger
- **cURL import/export** (paste cURL in URL bar or export from context menu)
- **Auth**: Basic, Bearer, OAuth 2.0, AWS Signature V4, Digest
- **Pre/post-request scripts** with the `nt.*` scripting API
- **Cookie jar management** with per-jar isolation and redirect cookie capture
- **Path parameters** with `{param}` and `:param` URI template syntax
- **Response viewer** with JSON tree view, diff view, JSON path filtering, syntax highlighting, and minimap
- **PDF and image preview** in the response panel
- **Download progress** bar for large responses
- **Pinned tabs** and **pinned sidebar items** for quick access
- **Command palette** with fuzzy search and frecency scoring
- **Keyboard shortcuts** with customizable bindings via the Settings panel
- **Resizable panels** with horizontal/vertical layout options
- **HTTP proxy** support with per-request configuration
- **SSL/TLS** configuration (custom certificates, reject unauthorized toggle)
- **Request notes** for documenting individual requests and collections
- **Workspace and global storage** modes with optional per-request file strategy for clean git diffs
- **Settings panel** with network, appearance, and editor configuration
- **Collection/folder-level auth and headers** with inheritance
- **Header autocomplete** for common HTTP headers
- **URL autocomplete** from request history
- **Variable indicator** showing unresolved variables in the Auth tab
