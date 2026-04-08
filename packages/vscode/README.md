# Nouto

An open-source REST client for VS Code. Send requests, organize collections, chain responses, and test APIs without leaving your editor.

> "Nouto" is Finnish for "fetch" or "pick up."

![Nouto REST Client](https://raw.githubusercontent.com/frostybee/nouto/main/assets/screenshots/nouto-vscode.png)

## Features

### HTTP Requests

Send requests using any standard method (GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS) or define your own. Requests support query parameters, headers, and path parameters with auto-completion, plus multiple body types including JSON, XML, form-data, x-www-form-urlencoded, binary, and GraphQL.

Authentication options: Basic, Bearer, API Key, OAuth 2.0 (PKCE), AWS Signature v4, NTLM, and Digest.

### Collections

Organize saved requests into collections with unlimited folder nesting. Drag-and-drop reordering and multi-select are supported. Collections can define their own variables, headers, auth, and scripts that child requests inherit.

Importing from other clients is straightforward: Postman, Insomnia, Thunder Client, Hoppscotch, Bruno, HAR files, and cURL commands are all supported.

### Environment Variables

Use `{{variableName}}` substitution anywhere in URLs, headers, params, and request bodies. Variables can be scoped globally, per environment, or per collection.

Built-in dynamic variables generate values on the fly:

- `{{$uuid.v4}}` - random UUID
- `{{$timestamp.unix}}` - current Unix timestamp
- `{{$random.int, 0, 100}}` - random integer in range

Chain responses across requests with `{{$response.body.token}}` to pass data from one request to the next. Secrets can be stored securely and kept separate from regular variables.

### Real-time Protocols

- **GraphQL:** schema introspection, variables, and operation selection
- **GraphQL subscriptions:** over WebSocket (graphql-ws protocol)
- **WebSocket:** send/receive messages, binary support, auto-reconnect
- **Server-Sent Events:** live event streams with filtering
- **gRPC:** server reflection, proto file loading, unary calls

### Testing and Automation

Write assertions against status codes, headers, response body, and JSONPath expressions. Pre-request and post-response scripts run JavaScript with access to `nt.sendRequest()`, `nt.setVariable()`, and `nt.test()`.

The collection runner executes all requests in a collection with configurable iterations and stop-on-failure. The benchmarking tool measures endpoint performance with statistical breakdowns.

### Developer Tools

- Response viewer with syntax highlighting, search, and word wrap
- Side-by-side response diff
- Code generation for 12+ languages (cURL, Python, JavaScript, TypeScript, C#, Go, Java, PHP, PowerShell, Swift, Dart, Ruby)
- Command palette with fuzzy search and frecency-based ranking
- Request history with search, filtering, and CSV/JSON export
- Cookie jar with domain grouping
- Mock server with configurable routes and latency simulation
- Customizable keyboard shortcuts

### Configuration

- SSL/TLS with custom CA and client certificates
- Proxy support (HTTP, HTTPS, SOCKS5) with authentication
- Git-friendly storage mode (one file per request)
- Configurable timeouts and redirect behavior

## Installation

Search for **Nouto** in the VS Code Extensions view, or run:

```bash
code --install-extension Frostybee.nouto
```

## Keyboard Shortcuts

| Action | Shortcut |
| ------ | -------- |
| Send Request | `Ctrl+Enter` |
| New Request | `Ctrl+N` |
| Save Request | `Ctrl+S` |
| Command Palette | `Ctrl+P` |
| Toggle Sidebar | `Ctrl+B` |
| Switch Layout | `Ctrl+L` |

All shortcuts are customizable in Settings.

## Desktop App

Nouto also ships as a standalone desktop app built with Tauri 2.0, running natively on Windows, macOS, and Linux.

## License

[MIT](LICENSE)
