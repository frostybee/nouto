# HiveFetch

A 100% open-source, privacy-respecting REST client available as both a VS Code extension and standalone desktop app.

## Features

- Send HTTP requests (GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS)
- Organize requests in collections with nested folders
- Environment variables with substitution
- Request history
- Import/Export Postman collections
- GraphQL support with schema introspection
- OAuth 2.0, Basic, and Bearer authentication
- Collection runner for automated testing
- Mock server for API prototyping
- Benchmarking tools
- WebSocket and SSE support

## Installation

**Important:** This project uses [pnpm](https://pnpm.io/) for faster installs and better disk space efficiency.

```bash
# Install pnpm globally (if not already installed)
npm install -g pnpm

# Install all dependencies
pnpm install
```

## Development

### VS Code Extension

```bash
# Compile extension and webview
pnpm run compile

# Watch mode for extension
pnpm run watch:extension

# Watch mode for webview (run in separate terminal)
pnpm run watch:webview

# Open VS Code extension host
# Press F5 in VS Code to launch Extension Development Host
```

### Desktop App (Tauri)

| Command              | From Root                 | From `packages/desktop` | Description                                 |
| -------------------- | ------------------------- | ----------------------- | ------------------------------------------- |
| **Development Mode** | `pnpm run dev:desktop`    | `pnpm run tauri dev`    | Start app with hot reload (Vite + Tauri)    |
| **Production Build** | `pnpm run build:desktop`  | `pnpm run tauri build`  | Create distributable executable             |

**Features:**

- ✅ Single instance enforcement (only one app runs at a time)
- ✅ Hot reload for Svelte changes (no rebuild needed)
- ✅ Rebuild required for Rust changes only

## Testing

### Run All Tests

```bash
pnpm run test:all
```

### Extension Tests (Jest)

```bash
# Run tests
pnpm test

# Run tests in watch mode
pnpm run test:watch

# Run tests with coverage report
pnpm run test:coverage
```

### Webview Tests (Vitest)

```bash
cd packages/ui

# Run tests
pnpm test

# Run tests in watch mode
pnpm run test:watch

# Run tests with coverage report
pnpm run test:coverage
```

### Coverage Requirements

Both test suites are configured with **80% coverage thresholds** for:

- Statements
- Branches
- Functions
- Lines

## Project Structure

This is a monorepo with multiple packages:

```text
packages/
├── core/                     # Shared types and utilities
│   └── src/types.ts          # TypeScript type definitions
├── transport/                # Message bus for extension-webview communication
│   └── src/index.ts
├── ui/                       # Shared Svelte UI components
│   ├── src/
│   │   ├── components/       # Svelte 5 components
│   │   ├── stores/           # State management (Svelte stores)
│   │   └── styles/           # CSS and themes
│   └── package.json
├── vscode/                   # VS Code extension
│   ├── src/
│   │   ├── extension.ts      # Extension entry point
│   │   ├── services/         # HTTP client, storage, etc.
│   │   ├── providers/        # Webview providers
│   │   └── commands/         # VS Code commands
│   └── package.json
└── desktop/                  # Tauri desktop app
    ├── src/
    │   ├── App.svelte        # Main app component
    │   └── lib/              # Tauri-specific utilities
    ├── src-tauri/            # Rust backend
    │   ├── src/
    │   │   ├── main.rs
    │   │   ├── commands/     # Tauri commands
    │   │   └── services/     # HTTP client, storage
    │   └── tauri.conf.json
    └── package.json
```

## License

MIT
