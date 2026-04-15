# Changelog

All notable changes to the Nouto VS Code extension will be documented in this file.

## [1.4.0] - 2026-04-15

### Added

- **Faker data generation**: 60+ `{{$faker.*}}` template variables for realistic mock data (names, emails, addresses, phone numbers, and more) powered by Faker
- **Prompt at send time**: `{{$prompt.keyName}}` variables show a dialog to collect values before sending — used once and not saved
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
