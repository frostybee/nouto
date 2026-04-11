# Nouto

An open-source REST client for VS Code. Send requests, organize collections, chain responses, and test APIs without leaving your editor.

> "Nouto" is Finnish for "fetch" or "pick up."

![Nouto REST Client](https://raw.githubusercontent.com/frostybee/nouto/main/assets/screenshots/nouto-vscode.png)

## Features

### HTTP Requests

Any standard method or custom. Body types: JSON, XML, form-data, URL-encoded, binary, plain text, GraphQL. Query params, headers, and path params with autocomplete.

Authentication: Basic, Bearer, API Key, OAuth 2.0 (PKCE), AWS Signature v4, Digest, and NTLM. Auth defined at collection or folder level is inherited by child requests.

### Collections

Unlimited folder nesting with drag-and-drop reordering. Collections define variables, headers, auth, and scripts that child requests inherit.

Two storage modes: **global** (VS Code global storage) or **workspace** (`.nouto/` directory, one file per request for clean git diffs).

### Environment Variables

`{{variableName}}` substitution in URLs, headers, params, and bodies. Scope resolves from request to folder to collection to global. Secrets stored in VS Code SecretStorage.

Dynamic variables: `{{$uuid.v4}}`, `{{$timestamp.unix}}`, `{{$random.int, 0, 100}}`. Chain responses with `{{$response.body.token}}`. Import from `.env` files with live reload.

### Real-time Protocols

- **WebSocket:** text and binary messages, auto-reconnect, message history with search
- **Server-Sent Events:** live event streams with type filtering and auto-reconnect
- **GraphQL subscriptions:** over WebSocket (`graphql-ws` protocol)
- **gRPC:** server reflection, proto file loading, all four call types, TLS/mTLS

### Testing and Automation

Pre-request and post-response JavaScript scripts with `nt.sendRequest()`, `nt.setVariable()`, and `nt.test()`. Scripts inherit from parent collections.

No-code assertion editor covering status codes, headers, body, JSONPath, response time, and JSON Schema. The collection runner supports iterations, CSV/JSON data files, stop-on-failure, and exports as JUnit XML, JSON, or HTML. The benchmarking tool reports percentiles (p50–p99), concurrency, and requests per second.

### Response Viewer

Auto-detects content type: JSON and XML (collapsible tree), HTML (rendered), images, PDF, binary (hex dump). Extras: JSONPath filter, find, diff view, timing breakdown, redirect chain, and response examples.

### Import and Export

Import from Postman, Insomnia, OpenAPI/Swagger, HAR, cURL, Hoppscotch, Thunder Client, Bruno, and Nouto native format (auto-detected). Export to Postman, HAR, and Nouto native format with full backup and restore.

### Developer Tools

- Code generation: cURL, JavaScript (Fetch, Axios), TypeScript, Python, C#, Go, Java, PHP, Swift, Dart, PowerShell, Ruby
- Command palette with fuzzy search and frecency-based ranking
- Request history with search, filtering, sort, and export
- Cookie jar with multiple named jars and domain matching
- Mock server with configurable routes, response headers, and latency simulation
- Customizable keyboard shortcuts

### Configuration

- SSL/TLS: custom CA, client certificates, mTLS
- Proxy: HTTP, HTTPS, SOCKS5 with authentication and per-request override
- Configurable timeouts and redirect behavior

## Installation

Search for **Nouto** in the VS Code Extensions view, or run:

```bash
code --install-extension frostybee-dev.nouto
```

## Desktop App

Nouto also ships as a standalone desktop app built with Tauri 2.0, running natively on Windows, macOS, and Linux.

## License

[MIT](LICENSE)
