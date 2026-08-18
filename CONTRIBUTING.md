# Contributing to Nouto

Thanks for taking the time. Bug reports and feature requests go through the [issue templates](.github/ISSUE_TEMPLATE/). For code changes, fork the repo, work on a branch, run `pnpm run test:all`, and open a pull request. Branch names are up to you.

## Prerequisites

This project uses [pnpm](https://pnpm.io/) as its package manager.

```bash
npm install -g pnpm
pnpm install
```

The desktop app also needs the [Tauri prerequisites](https://tauri.app/start/prerequisites/) (Rust toolchain plus platform build tools).

## Build commands

| Task | Command |
| --- | --- |
| Compile VS Code extension + webview | `pnpm run compile` |
| Watch extension | `pnpm run watch:extension` |
| Watch webview | `pnpm run watch:webview` |
| Build JSON Explorer extension | `pnpm run build:json-explorer-ext` |
| Desktop dev mode (hot reload) | `pnpm run dev:desktop` |
| Desktop production build | `pnpm run build:desktop` |
| Build CLI | `pnpm run build:cli` |
| Build docs site | `cd packages/website && pnpm run build` |

Press **F5** in VS Code to launch the Extension Development Host.

## Testing

| Task | Command |
| --- | --- |
| All suites | `pnpm run test:all` |
| Core only | `pnpm -F @nouto/core run test` |
| VS Code extension only | `pnpm -F nouto run test` |
| UI only | `pnpm -F @nouto/ui run test` |
| Watch mode | `pnpm run test:watch` |
| Coverage report | `pnpm run test:coverage` |

All suites enforce 80% coverage thresholds on statements, branches, functions, and lines.

## Test servers

Local servers for manual testing of WebSocket, GraphQL subscriptions, and gRPC. See [`test-servers/README.md`](test-servers/README.md).

| Server | Port | Protocol |
| --- | --- | --- |
| `gql-sub-test` | `ws://localhost:4000` | GraphQL subscriptions (graphql-ws) |
| `ws-echo-test` | `ws://localhost:4001` | WebSocket echo with ping |
| `grpc-test` | `localhost:50051` | gRPC with reflection (3 services) |

## Project structure

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
