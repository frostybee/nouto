# Quality gate

## Local checks

Run from the repo root:

| Command | Checks |
|---|---|
| `pnpm run format:check` | Prettier, over `packages/desktop` |
| `pnpm run lint` | ESLint, over `packages/desktop` |
| `pnpm run check:desktop` | `svelte-check` for the desktop frontend |
| `pnpm run check:ui` | `svelte-check` for `@nouto/ui` |
| `pnpm run knip` | Unused dependencies and exports in `packages/desktop` |
| `pnpm run rust:fmt` | `cargo fmt --check` in `src-tauri` |
| `pnpm run rust:clippy` | `cargo clippy -D warnings` in `src-tauri` |
| `pnpm run test:desktop` | `cargo test --lib` in `src-tauri` |
| `pnpm -F @nouto/desktop test` | Vitest unit tests for the frontend |
| `pnpm run check:all` | Runs the checks above in sequence |

`pnpm run test:all` additionally runs `@nouto/core`, the VS Code extension (`nouto`), and `@nouto/ui`'s own unit tests.

## What CI runs

`.github/workflows/desktop-ci.yml` triggers on pushes and pull requests to `main` that touch `packages/desktop`, `packages/core`, `packages/ui`, `packages/transport`, the lockfile, or the lint/format config. It has two jobs:

- `frontend` (Ubuntu): installs dependencies, runs `knip`, builds `@nouto/core` and `@nouto/transport`, then runs `format:check`, `lint`, `check:desktop`, `check:ui`, and the desktop Vitest suite.
- `rust` (Ubuntu 24.04 and Windows, matrix): installs Linux WebKitGTK dependencies where needed, stubs `dist/index.html` so `tauri::generate_context!` has something to embed, then runs `cargo fmt --check`, `cargo clippy -D warnings`, and `cargo test --lib`.

`.github/workflows/test.yml` runs the same broader Node test suite (`test:all`) across a small OS matrix on pushes and pull requests to `main` that touch any package.

## Rules of thumb

- New Rust command modules should carry unit tests for their pure logic (parsing, key naming, variable substitution) in an in-file `#[cfg(test)] mod tests`, matching the existing style in `services/storage.rs` and `services/aws_auth.rs`. Anything that needs the OS keychain or network access is not unit-tested here; CI runs on machines without a configured keychain.
- New frontend files default to `@typescript-eslint/no-explicit-any: error`. A short carve-out list in `eslint.config.mjs` still allows `any` in a few files with deeper typing debt (message-bus payloads mostly); new files should not need to join that list.
