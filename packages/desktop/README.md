# @nouto/desktop

Standalone Tauri 2 + Svelte 5 desktop app for Nouto. It shares its UI (`@nouto/ui`), core logic (`@nouto/core`), and message protocol (`@nouto/transport`) with the VS Code extension in `packages/vscode`.

## Quick start

```bash
pnpm install
pnpm run build:core
pnpm run build:transport
pnpm run dev:desktop
```

`dev:desktop` runs `tauri dev` from the repo root, which starts the Vite dev server and the Rust backend together with hot reload.

## Directory map

- `src/` — Svelte 5 frontend.
  - `main.ts` — entry point for the main window.
  - `settings-main.ts` — entry point for the standalone Settings window.
  - `App.svelte` — top-level layout: titlebar, sidebar, main content area, modals.
  - `lib/` — desktop-only glue: `tauri.ts` (the `TauriMessageBus`), `lifecycle.ts`, `recovery.ts`, `logger.ts`, and per-message-type handlers under `lib/handlers/`.
  - `components/` — desktop-only Svelte components (shared components live in `@nouto/ui`).
- `src-tauri/` — Rust backend.
  - `commands/` — Tauri command handlers, one file per feature area (`http.rs`, `grpc.rs`, `oauth.rs`, `runner.rs`, etc).
  - `services/` — supporting logic used by commands (`storage.rs`, `script_engine.rs`, `secret_extraction.rs`, `http_client.rs`, etc).
  - `models/` — Rust equivalents of the shared TypeScript types.
  - `lib.rs` — plugin registration and command wiring.

See `docs/developer/architecture-guide.md` at the repo root for how these pieces fit together.

## Scripts

Run from the repo root unless noted.

| Command | What it does |
|---|---|
| `pnpm run dev:desktop` | Start the app in dev mode with hot reload |
| `pnpm run build:desktop` | Production build |
| `pnpm run lint` | ESLint over `packages/desktop` |
| `pnpm run format:check` | Prettier check over `packages/desktop` |
| `pnpm run check:desktop` | `svelte-check` for the desktop package |
| `pnpm run check:ui` | `svelte-check` for `@nouto/ui` |
| `pnpm run knip` | Unused dependency/export check |
| `pnpm run rust:fmt` | `cargo fmt --check` in `src-tauri` |
| `pnpm run rust:clippy` | `cargo clippy -D warnings` in `src-tauri` |
| `pnpm run test:desktop` | `cargo test --lib` in `src-tauri` |
| `pnpm -F @nouto/desktop test` | Vitest unit tests for the frontend |
| `pnpm run check:all` | Runs the full local quality gate |

## More docs

- `docs/developer/` at the repo root: architecture, persistence and recovery, releases, error handling, commands and shortcuts, cross-platform notes, and the quality gate.
- `CHANGELOG.md` in this package: user-facing release notes.
