# Changelog

All notable changes to the Nouto desktop app will be documented in this file.

## [Unreleased]

### Added

- **OpenAPI lint rules expanded** to 65 rules across eleven groups: path key and parameter hygiene (trailing slashes, query strings in keys, duplicate or ambiguous routes, duplicate parameters), tag and info metadata (undeclared tags, duplicate tags, missing contact), server hygiene (trailing slash, missing servers, undefined server variables, empty enums), schema checks (duplicate or mistyped enum values, required properties that are not defined, `nullable` in 3.1+, mixed range constraints), component integrity (`$ref` siblings, unused components of every kind, undefined security schemes and scopes, `value` + `externalValue`, invalid component keys, nested callbacks, webhook servers/callbacks), an OWASP API Security group (integer/string/array bounds, 401/429/500 responses, `Retry-After`, JWT best practices, insecure schemes, credentials in query, numeric ids, unprotected unsafe operations), OpenAPI 3.2 structures (`in: querystring`, tag parents, `discriminator.defaultMapping`, sequential encodings), and unsafe Markdown detection. Most new rules ship one-click quick fixes.
- **Example validation**: `example` / `examples` values on schemas, media types, and parameters are validated against their schema and reported as the `example-invalid-schema` / `example-invalid-media` lint rules (validated by the Rust `jsonschema` engine, honouring OpenAPI 3.0 `nullable`)
- **OpenAPI 3.2 IntelliSense**: `in: querystring` parameter location and `discriminator.defaultMapping` completions and hover documentation
- **Auto-updater** with in-app update banner (check, download, install)
- **Deep linking** with `nouto://` protocol registration and OAuth callback support
- **Onboarding flow** with redesigned welcome screen, sample collection (httpbin.org), and contextual hints
- **Collection-scoped variables in benchmarks**, resolving variables from the collection and folder hierarchy
- **Reset onboarding** option in the Settings panel
- **JSON Explorer sort keys toggle**: toolbar button to reorder object keys alphabetically in the tree view without modifying the document
- **JSON Explorer subtree navigation**: right-click any object or array and open it in the explorer; a "Back to previous document" button navigates the stack
- **JSON Explorer embedded JSON detection**: string values containing a JSON object or array show an inline badge, with a context-menu action to open the parsed value
- **JSON Explorer JSONL / NDJSON support**: NDJSON response bodies parse as arrays with line-numbered error reporting for malformed lines
- **JSON Explorer compare from file**: a "Choose file..." button in the compare dialog picks a JSON file from disk via the native Tauri dialog
- **JSON Explorer schema validation**: paste a JSON Schema to validate the document; failing nodes are marked in the tree and the error panel lists path and message per violation

### Fixed

- Response JSON key order is now preserved from the wire (enabled `serde_json` `preserve_order`); previously the Rust backend silently alphabetized all object keys
- Benchmark now correctly substitutes collection-scoped and folder-scoped variables
- Various UI improvements and bug fixes

## [0.0.1] - 2026-03-23

Initial development release.

### Features

- **Tauri 2.0** native desktop app with Rust backend and Svelte 5 frontend
- **HTTP requests** with support for all methods (GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS, and custom methods)
- **HTTP client powered by reqwest** with gzip, brotli, deflate, and zstd decompression
- **Collections** with unlimited folder nesting, drag-and-drop reordering, and batch operations
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
- **Pinned tabs** and **pinned sidebar items** for quick access
- **Command palette** with fuzzy search and frecency scoring
- **Keyboard shortcuts** with customizable bindings
- **Custom themes** with a set of pre-built themes and VS Code theme migration
- **Secure secrets storage** via OS keychain
- **Workspace support** for creating and opening project directories
- **Single-instance enforcement** to prevent multiple windows
- **Undo/redo system** for request editing and collection operations
- **Runner result export** in JUnit XML and HTML formats
