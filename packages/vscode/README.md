# HiveFetch

A powerful, open-source REST client for VS Code and desktop. Test APIs, debug requests, and manage collections without leaving your editor.

## Features

**HTTP Requests**
- All standard methods (GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS) plus custom methods
- Query parameters, headers, and path parameters with auto-completion
- Request body: JSON, XML, form-data, x-www-form-urlencoded, binary, GraphQL
- Authentication: Basic, Bearer, API Key, OAuth 2.0 (PKCE), AWS Signature v4, NTLM, Digest

**Collections**
- Organize requests in collections with unlimited folder nesting
- Drag-and-drop reordering with multi-select support
- Collection-level variables, headers, auth, and scripts with inheritance
- Import from Postman, Insomnia, Thunder Client, Hoppscotch, Bruno, HAR, and cURL

**Environment Variables**
- Global, environment-scoped, and collection-scoped variables
- `{{variableName}}` substitution in URLs, headers, params, and body
- Dynamic variables: `{{$uuid.v4}}`, `{{$timestamp.unix}}`, `{{$random.int, 0, 100}}`
- Response chaining: `{{$response.body.token}}`
- Secure variable storage for secrets

**Real-time Protocols**
- WebSocket client with send/receive, binary, and auto-reconnect
- Server-Sent Events (SSE) with event filtering
- GraphQL subscriptions over WebSocket (graphql-ws)
- gRPC with server reflection, proto file loading, and unary calls

**Testing and Automation**
- Request assertions (status codes, headers, body, JSONPath)
- Pre-request and post-response JavaScript scripts
- Script API: `hf.sendRequest()`, `hf.setVariable()`, `hf.test()`
- Collection runner with iterations and stop-on-failure
- Performance benchmarking with statistical analysis

**Developer Experience**
- Response viewer with syntax highlighting, search, and word wrap
- Response diff view for comparing responses
- Code generation for 12 languages (cURL, Python, JS, TypeScript, C#, Go, Java, PHP, PowerShell, Swift, Dart)
- Command palette with fuzzy search and frecency-based ranking
- Request history with search, filtering, and CSV/JSON export
- Cookie jar management with domain grouping
- Mock server with configurable routes and latency simulation
- Customizable keyboard shortcuts

**Configuration**
- SSL/TLS with custom certificates and client certs
- Proxy support (HTTP, HTTPS, SOCKS5) with authentication
- Git-friendly storage mode (one file per request)
- Configurable timeouts and redirect following

## Installation

Search for "HiveFetch" in the VS Code Extensions marketplace, or install from the command line:

```
code --install-extension hivefetch.hivefetch
```

## Keyboard Shortcuts

| Action | Default Shortcut |
|--------|-----------------|
| Send Request | `Ctrl+Enter` |
| New Request | `Ctrl+N` |
| Save Request | `Ctrl+S` |
| Command Palette | `Ctrl+P` |
| Toggle Sidebar | `Ctrl+B` |
| Switch Layout | `Ctrl+L` |

All shortcuts are customizable in Settings.

## Desktop App

HiveFetch is also available as a standalone desktop app built with Tauri 2.0, providing native performance on Windows, macOS, and Linux.

## License

MIT
