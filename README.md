<p align="center">
  <img src="assets/icons/icon.svg" alt="Nouto" width="128" />
</p>

# Nouto

> "Nouto" is Finnish for "fetch" or "pick up."

Nouto is an open-source project that ships four products built from a shared codebase:

- **Nouto REST Client** for VS Code and as a standalone desktop app
- **Nouto JSON Explorer** VS Code extension
- **Nouto CLI** for running collections from the terminal
- **Documentation website** at [nouto.dev](https://nouto.frostybee.dev)

---

## Nouto REST Client

A full-featured API client that runs inside VS Code or as a standalone Tauri desktop app. Both share the same UI and core logic.

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

The docs site is built with [Astro](https://astro.build/) and [Starlight](https://starlight.astro.build/). It covers getting started guides, request building, authentication, variables, testing, CLI usage, and more.

```bash
cd packages/website
pnpm run dev       # local dev server
pnpm run build     # production build
```

---

## Getting Started

This project uses [pnpm](https://pnpm.io/) as its package manager.

```bash
npm install -g pnpm
pnpm install
```

## Development

### VS Code Extension

```bash
# Compile the extension and webview
pnpm run compile

# Watch mode (run each in its own terminal)
pnpm run watch:extension
pnpm run watch:webview

# Launch the Extension Development Host with F5 in VS Code
```

### JSON Explorer Extension

```bash
pnpm run build:json-explorer-ext
```

### Desktop App (Tauri 2.0)

| Command | From root | From `packages/desktop` |
| ------- | --------- | ----------------------- |
| Dev mode (hot reload) | `pnpm run dev:desktop` | `pnpm run tauri dev` |
| Production build | `pnpm run build:desktop` | `pnpm run tauri build` |

The desktop app enforces a single running instance. Svelte changes hot-reload automatically; only Rust changes require a rebuild.

### CLI

```bash
pnpm -F @nouto/cli run build
```

## Testing

```bash
# Run all test suites (core + vscode + ui)
pnpm run test:all

# Run a single package
pnpm -F @nouto/core run test
pnpm -F nouto run test
pnpm -F @nouto/ui run test

# Watch mode
pnpm run test:watch

# Coverage report
pnpm run test:coverage
```

All suites enforce **80% coverage thresholds** on statements, branches, functions, and lines.

## Test Servers

Local servers for manual testing of WebSocket, GraphQL subscriptions, and gRPC. See [`test-servers/README.md`](test-servers/README.md).

```bash
cd test-servers/<server>
npm install
node server.js
```

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
  ui/                  Svelte 5 components and stores (Vite)
  vscode/              VS Code REST Client extension (esbuild)
  desktop/             Desktop app (Tauri 2.0, Svelte + Rust)
    src/                 Svelte frontend
    src-tauri/           Rust backend (commands, services)
  json-explorer/       Shared Svelte component library for JSON exploration
  json-explorer-ext/   VS Code JSON Explorer extension
  cli/                 Command-line interface
  website/             Documentation site (Astro + Starlight)
test-servers/          Local dev servers (WebSocket, GraphQL, gRPC)
```

## License

[MIT](LICENSE)
