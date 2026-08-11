# Changelog

## [Unreleased]

### Added

- Standalone JSON Explorer extension: the JSON Explorer is now also published as its own lightweight VS Code extension, independent of the full REST client
- JSON statistics panel: key, object, array, depth, and value counts with a type distribution breakdown, array and string length stats, and a unique key list
- Minimap for the JSON Explorer: canvas overview with a viewport indicator and click to scroll for large documents
- Pinned nodes: an always visible strip of pinned paths with live value previews, separate from bookmarks and persisted across sessions
- Timestamp detection: Unix seconds, Unix milliseconds, and ISO 8601 values show an inline formatted date hint in tree rows and table cells
- Multi-select in the JSON Explorer: `Ctrl`/`Cmd`+click, `Shift`+click ranges, `Ctrl+A`, and `Escape`, with bulk copy and bookmark actions
- Additional copy formats: CSV, TypeScript, Python, PHP array, and Markdown table, plus a Save to File action for JSON, YAML, and CSV
- Sort keys toggle in the JSON Explorer: toolbar button to reorder object keys alphabetically in the tree view without modifying the document
- Open subtree in new tab: right-click any object or array in the JSON Explorer and open it as its own panel
- Embedded JSON detection: string values containing a JSON object or array show an inline badge, with a context-menu action to open the parsed value in a new panel
- JSONL / NDJSON support: `.jsonl` and `.ndjson` files open as arrays in the JSON Explorer, with line-numbered parse errors for malformed lines
- Compare against a file: a "Choose file..." button in the JSON Explorer compare dialog picks a JSON file from disk alongside the existing paste flow
- JSON Schema validation panel: paste a schema, failing nodes are marked in the tree, and the error panel lists path and message per violation with click-to-navigate

### Changed

- Type generation now also outputs Zod schemas and JSON Schema, in addition to TypeScript, Go, Rust, and Python
- Table view column pinning is now user-toggleable per column, replacing the fixed first data column, and the table toolbar gained a dedicated CSV export button

## [1.1.0] - 2026-03-28

### Features

- JSON Explorer: dedicated panel for navigating large JSON responses with tree view, table view, search (text, regex, fuzzy), JSONPath filtering, bookmarks, breadcrumb navigation, expand/collapse to depth, and diff comparison
- Undo/Redo system for both request editing (Ctrl+Z / Ctrl+Shift+Z) and collection tree operations (add, delete, rename, move, reorder)
- Collection runner result export in JSON, CSV, JUnit XML, and HTML report formats
- Onboarding experience with welcome screen, sample httpbin.org collection, and contextual hints for first-time users
- Soft delete with trash: deleted items go to trash with 30-day auto-purge, browse and restore from the Trash sidebar tab
- Backup and state export/import: export all app data (collections, environments, cookies, history, settings) to a single `.nouto-backup` file
- Query language for filtering JSON nodes (`field = "value"`, `field > 10`, AND/OR/NOT, regex, contains, startsWith, endsWith)
- Type generation from JSON responses (TypeScript, Go, Rust, Python)

## [1.0.0] - 2026-03-13

### Features

- HTTP requests with all standard methods (GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS) and custom methods
- Collections with unlimited nesting via folders, drag-and-drop reordering, and multi-select
- Environment variables with global, environment-scoped, and collection-scoped variable support
- Variable substitution in URLs, params, headers, and body with `{{variableName}}` syntax
- Dynamic variables: `{{$uuid.v4}}`, `{{$timestamp.unix}}`, `{{$timestamp.iso}}`, `{{$random.int, 0, 1000}}`
- Response context variables: `{{$response.body.token}}` for chaining requests
- GraphQL support with schema introspection, syntax highlighting, and variable editor
- GraphQL subscriptions over WebSocket (graphql-ws protocol)
- WebSocket client with send/receive, binary support, and auto-reconnect
- Server-Sent Events (SSE) client with event filtering and auto-reconnect
- gRPC support with server reflection, proto file loading, and unary calls
- Request assertions with status, header, body, and JSON path matchers
- Pre-request and post-response scripts with JavaScript runtime
- Script engine with `hf.sendRequest()` for chaining, `hf.setVariable()`, and `hf.test()`
- Collection runner with iteration support, stop-on-failure, and variable injection
- Benchmarking with configurable iterations, concurrency, and statistical analysis
- Mock server with route configuration, latency simulation, and request logging
- Request history with search, filtering, and export (JSON/CSV)
- Cookie jar management with domain grouping and jar switching
- Authentication: Basic, Bearer, API Key, OAuth 2.0 (authorization code, client credentials, PKCE), AWS Signature v4, NTLM, Digest
- SSL/TLS configuration with custom certificates and client certs
- Proxy support (HTTP, HTTPS, SOCKS5) with authentication
- Code generation for 12 languages: cURL, Python, JavaScript (Fetch/Axios), TypeScript, C#, Go, Java, PHP, PowerShell, Swift, Dart
- Import from Postman, Insomnia, Thunder Client, Hoppscotch, Bruno, HAR, and cURL
- Export to Nouto native format and HAR
- Command palette with fuzzy search and frecency-based suggestions
- Response diff view for comparing responses
- Binary response handling with preview and download
- Keyboard shortcuts with full customization
- Tauri 2.0 desktop app with native performance
- Git-friendly storage mode with one file per request
