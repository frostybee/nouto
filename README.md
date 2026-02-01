# HiveFetch

A 100% open-source, privacy-respecting REST client for VS Code.

## Features

- Send HTTP requests (GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS)
- Organize requests in collections with nested folders
- Environment variables with substitution
- Request history
- Import/Export Postman collections
- Basic and Bearer authentication

## Installation

```bash
npm run install:all
```

## Development

```bash
# Compile extension and webview
npm run compile

# Watch mode for extension
npm run watch:extension

# Watch mode for webview
npm run watch:webview
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

```text
src/
├── extension.ts              # Extension entry point
├── services/
│   ├── StorageService.ts     # Persistence layer
│   ├── ImportExportService.ts # Postman import/export
│   └── types.ts              # Shared TypeScript types
├── providers/
│   ├── RequestEditorProvider.ts  # Custom editor
│   └── SidebarViewProvider.ts    # Sidebar webview
├── commands/                 # VS Code commands
├── test/                     # Extension tests
│   ├── setup.ts
│   └── __mocks__/
│       └── vscode.ts
└── webview/
    ├── src/
    │   ├── stores/           # Svelte stores
    │   │   ├── collections.ts
    │   │   ├── history.ts
    │   │   ├── request.ts
    │   │   ├── environment.ts
    │   │   └── *.test.ts     # Store tests
    │   ├── components/       # Svelte components
    │   └── test/
    │       └── setup.ts
    ├── vitest.config.ts
    └── package.json
```

## License

MIT
