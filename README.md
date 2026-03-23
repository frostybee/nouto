# Nouto

An open-source REST client available as a VS Code extension and a standalone desktop app. Send requests, organize collections, chain responses, and test APIs.

> "Nouto" is Finnish for "fetch" or "pick up."

## Features

- HTTP requests (GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS, custom methods)
- Collections with unlimited folder nesting, drag-and-drop, and inheritance
- Environment variables with `{{substitution}}`, dynamic values, and response chaining
- Authentication: Basic, Bearer, API Key, OAuth 2.0 (PKCE), AWS Signature v4, NTLM, Digest
- GraphQL with schema introspection, variables, and operation selection
- GraphQL subscriptions over WebSocket (graphql-ws protocol)
- WebSocket client with binary support and auto-reconnect
- Server-Sent Events (SSE) with event filtering
- gRPC with server reflection, proto file loading, and unary calls
- Assertions, pre/post scripts, collection runner, benchmarking
- Code generation for 12+ languages
- Import from Postman, Insomnia, Thunder Client, Hoppscotch, Bruno, HAR, cURL
- Mock server, cookie jar, request history, response diff
- SSL/TLS, proxy support, git-friendly storage

## Requirements

This project uses [pnpm](https://pnpm.io/) as its package manager.

```bash
npm install -g pnpm
pnpm install
```

## Development

### VS Code Extension

```bash
# Compile extension and webview
pnpm run compile

# Watch mode (run in separate terminals)
pnpm run watch:extension
pnpm run watch:webview

# Launch Extension Development Host
# Press F5 in VS Code
```

### Desktop App (Tauri 2.0)

| Command | From root | From `packages/desktop` |
| ------- | --------- | ----------------------- |
| Dev mode (hot reload) | `pnpm run dev:desktop` | `pnpm run tauri dev` |
| Production build | `pnpm run build:desktop` | `pnpm run tauri build` |

- Single instance enforcement (only one app runs at a time)
- Hot reload for Svelte changes (no rebuild needed)
- Rebuild required for Rust changes only

## Testing

```bash
# All tests (core + vscode + ui)
pnpm run test:all

# Individual packages
pnpm -F @nouto/core run test
pnpm -F nouto run test
pnpm -F @nouto/ui run test

# Watch mode
pnpm run test:watch

# Coverage report
pnpm run test:coverage
```

Both test suites enforce **80% coverage thresholds** on statements, branches, functions, and lines.

## Project Structure

```text
packages/
  core/           Shared types, services, parsers
  transport/      IMessageBus interface + message definitions
  ui/             Svelte 5 components + stores (Vite)
  vscode/         VS Code extension (esbuild)
  desktop/        Tauri 2.0 desktop app (Svelte + Rust)
    src/           Svelte frontend
    src-tauri/     Rust backend (commands, services)
```

## License

[MIT](LICENSE)
