<p align="center">
  <img src="assets/icons/icon.png" alt="Nouto" width="128" />
</p>

<h1 align="center">Nouto</h1>
<p align="center"><strong>Open-source API client for REST, GraphQL, WebSockets, SSE and gRPC.</strong></p>
<p align="center"><em>"Nouto" (NOH-u-to) is Finnish for "fetch" or "pick up."</em></p>

Nouto is an open-source project that ships four products built from a shared codebase:

- **Nouto API Client** for VS Code and as a standalone desktop app
- **Nouto JSON Explorer** VS Code extension
- **Nouto CLI** for running collections from the terminal
- **Documentation website** at [nouto.frostybee.dev](https://nouto.frostybee.dev)

---

## Nouto API Client

A Postman and Thunder Client alternative. A full-featured API client for REST, GraphQL, WebSockets, SSE and gRPC that runs inside VS Code or as a standalone desktop app.

### Features

**Requests and protocols**

- HTTP methods: GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS, and custom methods
- GraphQL with schema introspection, variables, and operation selection
- GraphQL subscriptions over WebSocket (graphql-ws protocol)
- WebSocket client with binary frame support and auto-reconnect
- Server-Sent Events (SSE) with event filtering
- gRPC with server reflection, proto file loading, and unary calls

**Organization**

- Collections with unlimited folder nesting, drag-and-drop reordering, and inheritance
- Environment variables with `{{substitution}}`, dynamic values, and response chaining
- Request history with full response data

**Authentication**

- Basic, Bearer, API Key
- OAuth 2.0 with PKCE
- AWS Signature v4, NTLM, Digest

**Testing and automation**

- Assertions with a built-in rule engine
- Pre-request and post-request scripts
- Collection runner for batch execution
- Benchmarking with configurable concurrency

**Utilities**

- Code generation for 12+ languages
- Import from Postman, Insomnia, Thunder Client, Hoppscotch, Bruno, HAR, and cURL
- Mock server, cookie jar, response diff viewer
- SSL/TLS client certificates, proxy support, git-friendly file storage

## Nouto JSON Explorer

A VS Code sidebar extension for exploring JSON data. Paste or open any JSON and browse it as a collapsible tree or sortable table. Supports fuzzy search, JSONPath filtering, bookmarks, and copy in multiple formats. See the [extension README](packages/json-explorer-ext/README.md) for details.

## Nouto CLI

Run collections, generate code snippets, benchmark endpoints, and import/export data from the command line.

```bash
nouto run <collection> [--env production]
nouto benchmark <collection> [--concurrency 10]
nouto codegen <request> --language python
nouto import <file> --format postman
nouto export <collection> --format har
```

See [`packages/cli`](packages/cli/) for full usage.

## Documentation Website

Covers getting started guides, request building, authentication, variables, testing, CLI usage, and more.

---

## Getting Started

This project uses [pnpm](https://pnpm.io/) as its package manager.

```bash
npm install -g pnpm
pnpm install
```

## Build Commands

| Task | Command |
|------|---------|
| Compile VS Code extension + webview | `pnpm run compile` |
| Watch extension | `pnpm run watch:extension` |
| Watch webview | `pnpm run watch:webview` |
| Build JSON Explorer extension | `pnpm run build:json-explorer-ext` |
| Desktop dev mode (hot reload) | `pnpm run dev:desktop` |
| Desktop production build | `pnpm run build:desktop` |
| Build CLI | `pnpm -F @nouto/cli run build` |
| Build docs site | `cd packages/website && pnpm run build` |

Press **F5** in VS Code to launch the Extension Development Host.

## Testing

| Task | Command |
|------|---------|
| All suites | `pnpm run test:all` |
| Core only | `pnpm -F @nouto/core run test` |
| VS Code extension only | `pnpm -F nouto run test` |
| UI only | `pnpm -F @nouto/ui run test` |
| Watch mode | `pnpm run test:watch` |
| Coverage report | `pnpm run test:coverage` |

All suites enforce **80% coverage thresholds** on statements, branches, functions, and lines.

## Test Servers

Local servers for manual testing of WebSocket, GraphQL subscriptions, and gRPC. See [`test-servers/README.md`](test-servers/README.md).

| Server | Port | Protocol |
|--------|------|----------|
| `gql-sub-test` | `ws://localhost:4000` | GraphQL subscriptions (graphql-ws) |
| `ws-echo-test` | `ws://localhost:4001` | WebSocket echo with ping |
| `grpc-test` | `localhost:50051` | gRPC with reflection (3 services) |

## Project Structure

```text
packages/
  core/                Shared types, services, and parsers
  transport/           IMessageBus interface and message definitions
  ui/                  Shared components and stores
  vscode/              VS Code API Client extension
  desktop/             Desktop API Client
    src/                 Frontend
    src-tauri/           Backend
  json-explorer/       Shared JSON exploration component library
  json-explorer-ext/   VS Code JSON Explorer extension
  cli/                 Command-line interface
  website/             Documentation site
test-servers/          Local dev servers (WebSocket, GraphQL, gRPC)
```

## License

[MIT](LICENSE)
