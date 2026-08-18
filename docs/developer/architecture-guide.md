# Architecture guide

## The multi-platform split

Nouto ships as two frontends that share most of their code:

- `packages/vscode` — a VS Code extension. It runs in Node.js and talks to the webview through `postMessage`.
- `packages/desktop` — a standalone Tauri 2 app. It runs a Rust backend and talks to the Svelte frontend through Tauri's `invoke`/`listen`.

Both frontends embed the same `@nouto/ui` Svelte components and the same `@nouto/core` services (HTTP logic, codegen, parsers, types). Neither the components nor `@nouto/core` import anything platform-specific. The platform difference is isolated behind `@nouto/transport`'s `IMessageBus` interface: `send()`, `onMessage()`, `getState()`, `setState()`.

## The message bus

`packages/desktop/src/lib/tauri.ts` implements `IMessageBus` as `TauriMessageBus`. When a UI component calls `messageBus.send({ type: 'sendRequest', data: {...} })`, `TauriMessageBus` looks up whether `'sendRequest'` has a Rust command (`RUST_COMMAND_TYPES`, a `Set` near the top of the file), converts the message type to a Rust command name, and calls `invoke`.

The name conversion is mechanical: `messageTypeToCommand()` turns camelCase into snake_case (`sendRequest` -> `send_request`), with one special case (`GraphQL` -> `Graphql`) so `gqlSubSubscribe`-style names line up with the Rust function names. `OutgoingMessage`/`IncomingMessage` (both defined in `packages/transport/src/messages.ts`) are the typed union of every message the bus can carry in either direction.

Responses come back the other way: a Rust command calls `app.emit("eventName", payload)`, and `TauriMessageBus` has a `listen()` call per event name that turns the payload into an `IncomingMessage` and dispatches it to subscribers.

Message handling for a given feature area is split into files under `src/lib/handlers/` (`runner-handler.ts`, `environment-handler.ts`, `ws-session-handler.ts`, etc). `tauri.ts` routes an incoming message to the right handler by checking `message.type` against a `Set` of message types for that area (see `COOKIE_MESSAGE_TYPES`, `COLLECTION_MESSAGE_TYPES`, `ENVIRONMENT_MESSAGE_TYPES` near the top of the file).

## Rust backend layout

`packages/desktop/src-tauri/src/`:

- `lib.rs` — builds the Tauri app: registers plugins, sets up managed state, wires the `.setup()` hooks, and lists every command in `generate_handler!`. Plugin order matters: single-instance is registered first (so a second launch can hand off to the existing window before anything else initializes), logging goes second (so every later plugin's setup is captured in the log).
- `commands/` — one file per feature area, each holding `#[tauri::command]` functions plus (where useful) an in-file `#[cfg(test)] mod tests` for the pure logic in that file.
- `services/` — supporting logic that isn't itself a command: `storage.rs` (disk persistence), `script_engine.rs` (the QuickJS sandbox for pre-request/post-response scripts), `http_client.rs`, `secret_extraction.rs` (keychain key naming), and so on.
- `models/` — Rust structs mirroring the shared TypeScript types in `@nouto/core`.
- `state.rs` — small process-wide flags shared between window event handlers and commands (for example `AppState.force_close`, used by the close handshake).

Managed state (`app.manage(...)`) and long-lived registries (request cancellation, WebSocket/SSE/gRPC connection maps) are created once in `run()` and handed to `.manage()` before `.setup()` runs, so any command can reach them through `tauri::State`.

## Adding a new command

1. Add the Rust `#[tauri::command] async fn ...(...) -> Result<T, AppError>` in the right `commands/*.rs` file.
2. List it in the `generate_handler!` macro in `lib.rs`.
3. Add the message type to `OutgoingMessage`/`IncomingMessage` in `packages/transport/src/messages.ts` if it's a new message shape.
4. Add the message type string to `RUST_COMMAND_TYPES` in `tauri.ts` (or, if the command should bypass the message bus entirely — see `lib/lifecycle.ts` and `lib/recovery.ts` — call `invoke` directly and add the file to `RAW_INVOKE_ALLOWLIST` in the root `eslint.config.mjs`).
