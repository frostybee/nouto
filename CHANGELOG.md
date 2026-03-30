# Changelog

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
