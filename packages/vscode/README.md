<p align="center">
  <img src="https://raw.githubusercontent.com/frostybee/nouto/main/packages/vscode/images/icon.png" alt="Nouto" width="128" height="128">
</p>

<h1 align="center">Nouto</h1>

<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=frostybee-dev.nouto"><img src="https://img.shields.io/visual-studio-marketplace/v/frostybee-dev.nouto" alt="VS Marketplace Version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
  <img src="https://img.shields.io/badge/VS%20Code-%E2%89%A51.74.0-007acc" alt="VS Code Version">
</p>

<p align="center">
  <a href="https://github.com/frostybee/nouto"><strong>Repository</strong></a> ·
  <a href="https://github.com/frostybee/nouto/issues">Issues</a> ·
  <a href="https://marketplace.visualstudio.com/items?itemName=frostybee-dev.nouto">Marketplace</a> ·
  <a href="https://nouto.dev">Documentation</a>
</p>

An open source API client for VS Code. Send HTTP, GraphQL, WebSocket, SSE, and gRPC requests, organize collections, chain responses, and test APIs without leaving your editor.

> "Nouto" is Finnish for "fetch" or "pick up."

![Nouto REST Client](https://raw.githubusercontent.com/frostybee/nouto/main/assets/screenshots/nouto-vscode.png)

## Features

### HTTP Requests

Any standard method or custom method. Body types: JSON, XML, form data, URL encoded, binary, plain text, and GraphQL. Query params, headers, and path params include autocomplete. Type `{{` in the body editor for variable autocomplete. `Ctrl+Enter` sends the request from any body editor.

Authentication: Basic, Bearer, API Key, OAuth 2.0 (PKCE), AWS Signature v4, Digest, and NTLM. Auth defined at collection or folder level is inherited by child requests.

### Collections

Unlimited folder nesting with drag-and-drop reordering. Collections define variables, headers, auth, and scripts that child requests inherit.

Two storage modes: **global** (VS Code global storage) or **workspace** (`.nouto/` directory, one file per request for clean git diffs). Undo/redo for request editing and collection tree operations. Soft delete with trash and 30-day auto-purge.

### Environment Variables

`{{variableName}}` substitution in URLs, headers, params, and bodies. Scope resolves from request to folder to collection to global. Secrets stored in VS Code SecretStorage.

Dynamic variables: `{{$uuid.v4}}`, `{{$timestamp.unix}}`, `{{$random.int, 0, 100}}`, 60+ `{{$faker.*}}` generators for realistic mock data, `{{$prompt.keyName}}` for send-time input dialogs, and `{{$file.read, /path}}` for file content. Chain responses with `{{$response.body.token}}`. Import from `.env` files with live reload.

### Real-time Protocols

- **WebSocket:** text and binary messages, auto-reconnect, message history with search
- **Server-Sent Events:** live event streams with type filtering and auto-reconnect
- **GraphQL over HTTP:** queries and mutations with variables, operation names, and schema introspection
- **GraphQL subscriptions:** over WebSocket (`graphql-ws` protocol)
- **gRPC:** server reflection, proto file loading, all four call types, TLS/mTLS

### Testing and Automation

Pre-request and post-response JavaScript scripts with `nt.sendRequest()`, `nt.setVariable()`, and `nt.test()`. Scripts inherit from parent collections.

No code assertion editor covering status codes, headers, body, JSONPath, response time, and JSON Schema. The collection runner supports iterations, CSV/JSON data files, stop on failure, and exports as JUnit XML, JSON, CSV, or HTML. The benchmarking tool reports percentiles from p50 through p99, concurrency, and requests per second.

### Response Viewer

Auto-detects content type: JSON and XML (collapsible tree), HTML (rendered), images, PDF, binary (hex dump). Download progress bar for large responses. Timing breakdown, redirect chain, and response examples.

JSON Explorer: tree and table views with virtual scrolling, query filter (`Ctrl+Shift+K`), JSONPath filter (`Ctrl+/`), compare/diff against a pasted document, type generation (TypeScript, Zod, Rust, Go, Python, JSON Schema), statistics panel, minimap, bookmarks, pinned nodes with live value previews, timestamp detection, multi-select with bulk copy/bookmark, and copy as JSON, YAML, CSV, TypeScript, Python, PHP array, or Markdown table.

### OpenAPI

Author and preview OpenAPI 3.0, 3.1, and 3.2 specifications without leaving VS Code.

- **Editing**: schema-aware autocomplete with required-key scaffolding, hover documentation, go-to-definition for `$ref` (internal and external files), and document symbols for `Ctrl+Shift+O`
- **Diagnostics**: YAML syntax errors, schema validation, semantic checks (duplicate operationId, missing path params), and 65 lint rules across eleven groups including OWASP API security checks. Each rule's severity is configurable; opt-in rules stay off until you enable them
- **Quick fixes**: one-click code actions to resolve diagnostics inline, covering missing responses, unbounded parameters, insecure URLs, unused components, and more
- **CodeLens**: a "Nouto: Try It" lens above every operation sends the request through the extension
- **Outline sidebar**: structural tree with context-menu editing: add/delete paths, operations, servers, tags, security schemes (presets for API Key, Bearer, Basic, OAuth2, OpenID Connect), components, and webhooks. Explains parse failures inline and retains the last good tree
- **Preview panel**: rendered API docs via Swagger UI or RapiDoc with built-in Try It (bypasses browser CORS) and theme control
- **Example specs**: open a bundled Swagger Petstore spec (3.0 or 3.2) from the command palette or the outline
- **Generation**: create a collection from an OpenAPI spec, generate a spec from a collection or a HAR file, infer JSON Schema from response bodies

### Import and Export

Import from Postman, Insomnia, OpenAPI v3, HAR, cURL, Hoppscotch, Thunder Client, Bruno, Nouto native format, and URL (auto-detect). Export to Postman, HAR, and Nouto native format, with bulk export. Full backup and restore saves all app data (collections, environments, cookies, history, settings) to a single `.nouto-backup` file. Request history is also importable and exportable independently.

### Developer Tools

- Code generation: cURL, JavaScript Fetch, JavaScript Axios, Python, C#, Go, Java, PHP, Swift, Dart, PowerShell, and TypeScript types
- Command palette with fuzzy search and frecency-based ranking
- Request history with search, filtering, sort, and export
- Cookie jar with multiple named jars and domain matching
- Mock server with configurable routes, response headers, and latency simulation
- Onboarding: welcome screen with a sample httpbin.org collection and contextual hints
- Customizable keyboard shortcuts

### Configuration

- SSL/TLS: custom CA, client certificates, mTLS, global `rejectUnauthorized` toggle with per-request override
- Proxy: HTTP, HTTPS, SOCKS5 with authentication and per-request override
- URL auto-correction for malformed URLs
- Configurable timeouts and redirect behavior

## Installation

Search for **Nouto** in the VS Code Extensions view, or run:

```bash
code --install-extension frostybee-dev.nouto
```

## Desktop App

Nouto also ships as a standalone desktop app built with Tauri 2.0, running natively on Windows, macOS, and Linux.

## License

Copyright (c) 2026 FrostyBee.

Nouto is licensed under the [MIT License](LICENSE).
