# Nouto

An open-source REST client for VS Code. Send requests, organize collections, test APIs, chain responses, and work with real-time protocols without leaving your editor.

> "Nouto" is Finnish for "fetch" or "pick up."

![Nouto REST Client](https://raw.githubusercontent.com/frostybee/nouto/main/assets/screenshots/nouto-vscode.png)

---

## Quick Start

Search for **Nouto** in the VS Code Extensions view, or run:

```bash
code --install-extension Frostybee.nouto
```

No account required. Install and start sending requests immediately.

---

## HTTP Requests

Send requests using any standard method (GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS) or define your own custom method. The request editor provides:

- **Query parameters** with inline key-value editor
- **Path parameters** auto-detected from URL patterns (e.g. `/users/:id`)
- **Headers** with autocomplete for 130+ standard headers and value suggestions
- **Per-request settings**: timeout, redirect behavior, SSL verification, proxy override, and cookie jar selection

### Request Body

| Type | Description |
|---|---|
| JSON | Auto-format and prettify |
| XML | Auto-format and prettify |
| Form Data | Multipart with file upload support |
| URL Encoded | `application/x-www-form-urlencoded` |
| Binary | File upload with progress tracking |
| GraphQL | Query body with variables and operation name fields |
| Plain Text | Raw text body |

---

## Authentication

| Type | Details |
|---|---|
| Basic | Username and password |
| Bearer Token | Token stored in SecretStorage |
| API Key | Header or query parameter placement |
| OAuth 2.0 | Authorization code (PKCE), client credentials, implicit, password grant; token refresh and expiry tracking |
| AWS Signature v4 | Region, service, and session token support |
| Digest | Challenge/response digest authentication |
| NTLM | Domain and workstation support |

Authentication can be defined at the collection or folder level and inherited by child requests. Each request can inherit, override, or explicitly disable parent auth.

---

## Collections

Organize saved requests into collections with unlimited folder nesting. Collections support:

- Drag-and-drop reordering and multi-select operations
- Custom colors and icons per collection and folder
- Per-folder and per-collection variables, headers, auth, and scripts that child requests inherit
- Markdown notes per request and per folder
- Pinned requests for quick access
- Soft-delete with trash recovery

### Storage Modes

**Global mode** stores all collections in VS Code global storage, available across workspaces.

**Workspace mode** (`.nouto/`) writes one file per request to your project directory. Each request is a standalone JSON file, making collection changes readable in version control with clean, minimal diffs.

---

## Environment Variables

Use `{{variableName}}` substitution anywhere in URLs, headers, params, and request bodies. Variable scope resolves from request to folder to collection to global.

Variables can be defined per environment and switched without modifying requests. Secrets are stored in VS Code SecretStorage, separate from regular variables.

**Built-in dynamic variables:**

| Variable | Output |
|---|---|
| `{{$uuid.v4}}` | Random UUID |
| `{{$timestamp.unix}}` | Current Unix timestamp |
| `{{$timestamp.iso}}` | Current ISO 8601 timestamp |
| `{{$random.int, 0, 100}}` | Random integer in range |

**Response chaining:** Pass data from one request to the next using `{{$response.body.token}}` with JSONPath extraction. Variables can also reference response headers, cookies, and status codes.

**`.env` file support:** Import variables from `.env` files in your workspace, with live reload on file changes.

---

## Real-time Protocols

### WebSocket

Connect to WebSocket endpoints and send text or binary messages. Features include auto-reconnect with configurable intervals, custom connection headers, message history with timestamps, and search and filter across the message log.

### Server-Sent Events

Connect to SSE streams and receive live events. Filter by event type, track connection state, and view the full event log with data capture. Auto-reconnects using the `Last-Event-ID` header.

### GraphQL Subscriptions

Subscribe to GraphQL events over WebSocket using the `graphql-ws` protocol. Supports connection parameters and real-time event streaming with operation-specific variables.

### gRPC

Call gRPC services with full server reflection for automatic service discovery. You can also load `.proto` files directly from the filesystem. Supports all four call types: unary, client-streaming, server-streaming, and bidirectional streaming. Custom metadata headers, TLS/mTLS configuration, and all 16 gRPC status codes are supported.

---

## Scripting

Write JavaScript that runs before or after every request. Scripts have access to:

- `nt.sendRequest(request)` — send an HTTP request from within a script
- `nt.setVariable(name, value)` — set an environment or global variable
- `nt.getVariable(name)` — read a variable
- `nt.test(name, fn)` — register a named test assertion
- `console.log/warn/error/info` — captured and displayed in the script log

Scripts inherit from parent collections and folders. Pre-request scripts can modify the URL, method, headers, and body before execution. Post-response scripts can extract response data and set variables for subsequent requests. In the collection runner, scripts can use `nt.nextRequest` to control execution order.

---

## Assertions

Build assertions without writing code using the visual assertion editor. Assertions run after each request and report pass/fail with actual vs. expected values.

**Assertion targets:** status code, response time, response size, headers, content type, response body text, JSONPath expressions, JSON Schema, gRPC status, and stream message count/content.

**Operators:** equals, not equals, greater/less than, contains, not contains, regex match, exists, not exists, type check, array item matching.

Assertions can be defined at the collection or folder level and inherited by child requests.

---

## Collection Runner

Execute all requests in a collection sequentially with configurable options:

- **Iterations**: run the full collection multiple times
- **Data files**: drive iterations with CSV or JSON files; each row maps to variables
- **Delay**: configurable delay between requests in milliseconds
- **Stop on failure**: halt the run on the first assertion failure
- **Request skipping**: exclude specific requests from a run

Runner results show per-request status, duration, and assertion outcomes. Export results as JUnit XML, JSON, or HTML. A history of all previous runs is retained.

---

## Benchmarking

Measure endpoint performance with configurable concurrency and iteration counts. The benchmarking tool reports:

- Min, max, mean, and median response times
- Percentiles: p50, p75, p90, p95, p99
- Requests per second throughput
- Per-iteration latency distribution histogram
- Success and failure counts

---

## Response Viewer

The response panel automatically selects the appropriate viewer based on content type:

| Content Type | Viewer |
|---|---|
| JSON | Collapsible tree with fold depth control |
| XML | Collapsible tree with attribute support |
| HTML | Rendered preview |
| Images | Inline viewer (PNG, JPG, GIF, SVG, WebP, etc.) |
| PDF | Multi-page viewer |
| Binary | Hex dump viewer |
| Text | Syntax-highlighted plain text |

Additional tools in the response panel:

- **JSONPath filter**: narrow down JSON responses by expression
- **Find**: `Ctrl+F` search within response content
- **Word wrap**: toggle for long lines
- **Diff view**: side-by-side comparison of two responses
- **Minimap**: configurable overview panel (auto, always, never)
- **Response examples**: save named response snapshots per request
- **Timing breakdown**: DNS, TCP, TLS, TTFB, and transfer time
- **Timeline**: chronological event log for the full request lifecycle
- **Size stats**: response size breakdown by content type
- **Redirect chain**: view intermediate responses when redirects are followed

---

## Request History

Every request is automatically logged. The history panel provides:

- Full-text search across method, URL, headers, and body
- Filter by HTTP method, status range (2xx, 3xx, 4xx, 5xx, errors), date range, and collection
- Sort by newest, oldest, slowest, fastest, status, or method
- Pin important entries for quick access
- Export and import history data in CSV or JSON
- Usage statistics: top endpoints, status distribution, error rate

---

## Cookie Jar

Manage multiple named cookie jars. Cookies are persisted across sessions and matched by domain automatically. You can add cookies manually, inspect all stored cookies, and select which jar to use per request.

---

## Mock Server

Define mock routes with configurable responses:

- Path parameters in route patterns
- Any HTTP method
- Custom status codes, response headers, and body (JSON, XML, text)
- Latency simulation with min/max range for realistic testing
- Request log showing matched routes and incoming payloads

---

## Code Generation

Generate runnable code snippets from any request in 12+ languages:

| Language | Library |
|---|---|
| cURL | — |
| JavaScript | Fetch API |
| JavaScript | Axios |
| TypeScript | Types (request/response) |
| Python | Requests |
| C# | HttpClient |
| Go | net/http |
| Java | HttpClient |
| PHP | cURL |
| Swift | URLSession |
| Dart | http |
| PowerShell | Invoke-WebRequest |
| Ruby | Net::HTTP |

All authentication, headers, and body encoding are translated correctly per language.

---

## Import and Export

### Import

| Format | Source |
|---|---|
| Postman | Collection v2.1 |
| Insomnia | Collections |
| OpenAPI / Swagger | Specifications |
| HAR | HTTP Archive files |
| cURL | Command strings |
| Hoppscotch | Collections |
| Thunder Client | Collections |
| Bruno | Collections |
| Nouto | Native format |

Format is detected automatically from file content. Collections can also be imported directly from a URL.

### Export

- Postman Collection v2.1
- HAR (HTTP Archive)
- Nouto native format
- Bulk export (all collections at once)
- Full backup and restore

---

## Command Palette

Press `Ctrl+P` to open the command palette. Fuzzy search across all saved requests with frecency-based ranking. Results are grouped by collection and show method badges and request type icons. Use it to quickly open, run, or switch between requests.

---

## SSL / TLS

- Global SSL certificate verification toggle
- Per-request override
- Custom CA certificate loading
- Client certificate and private key (PEM) with optional passphrase
- Full mTLS support

---

## Proxy

- HTTP, HTTPS, and SOCKS5 proxy protocols
- Proxy username and password authentication
- No-proxy list for bypassing specific hosts or CIDRs
- Per-request proxy override
- Respects `http_proxy` and `https_proxy` environment variables

---

## Keyboard Shortcuts

| Action | Shortcut |
|---|---|
| Send Request | `Ctrl+Enter` |
| New Request | `Ctrl+N` |
| Import cURL | `Ctrl+U` |
| Save Request | `Ctrl+S` |
| Duplicate Request | `Ctrl+D` |
| New Collection | `Ctrl+Alt+N` |
| Command Palette | `Ctrl+P` |
| Toggle Sidebar | `Ctrl+B` |
| Switch Layout | `Ctrl+L` |

All shortcuts are customizable in Settings.

---

## Extension Settings

| Setting | Description |
|---|---|
| `nouto.storage.mode` | `global` or `workspace` (git-friendly) storage |
| `nouto.ssl.rejectUnauthorized` | Global SSL certificate verification |
| `nouto.autoCorrectUrls` | Automatically fix malformed URLs |
| `nouto.history.saveResponseBody` | Store response bodies in history |
| `nouto.minimap` | Response minimap: `auto`, `always`, or `never` |
| `nouto.shortcuts` | Custom keyboard shortcut overrides |

---

## Desktop App

Nouto also ships as a standalone desktop app built with Tauri 2.0, running natively on Windows, macOS, and Linux. It shares the same UI and core logic as the VS Code extension.

---

## License

[MIT](LICENSE)
