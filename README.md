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

```bash
npm run install:all
```

## Development

### VS Code Extension

```bash
# Compile extension and webview
npm run compile

# Watch mode for extension
npm run watch:extension

# Watch mode for webview (run in separate terminal)
npm run watch:webview

# Open VS Code extension host
# Press F5 in VS Code to launch Extension Development Host
```

### Desktop App (Tauri)

```bash
# Run desktop app in development mode
npm run dev:desktop

# Build desktop app for production
npm run build:desktop
```

## Testing

### Run All Tests

```bash
npm run test:all
```

### Extension Tests (Jest)

```bash
# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage report
npm run test:coverage
```

### Webview Tests (Vitest)

```bash
cd src/webview

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage report
npm run test:coverage
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
