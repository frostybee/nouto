# Persistence and recovery

## Where data lives

`StorageService` (`packages/desktop/src-tauri/src/services/storage.rs`) reads and writes JSON files under `<app_data_dir>/nouto/`: `collections.json`, `environments.json`, `settings.json`, `trash.json`, `meta.json`. When a project folder is open, `ProjectStorageService` writes to a `.nouto/` folder inside that project instead. Both services expose the same shape of `load_*`/`save_*` async functions.

Writes go through a temp-file-then-rename pattern so a crash mid-write can't leave a half-written file on disk.

## Corrupt-file recovery

If a JSON file fails to parse on load, `read_json_or_recover()` (top of `storage.rs`) renames it to `<name>.corrupt-<unix_ts>` (the `CORRUPT_MARKER` constant) and returns the type's default value instead of erroring out. Each service tracks which files it recovered this way in `take_recovered()`. `commands/mod.rs`'s `load_data` command collects all of these across every store it loads and, if any were recovered, emits a one-time `storageRecovered` event so the frontend can tell the user a backup was made.

## Debounced saves

Two layers debounce writes so typing doesn't trigger a disk write on every keystroke:

- `TauriMessageBus` in `src/lib/tauri.ts` debounces `save_collections` calls with `_saveTimer` (see `_pendingSavePayload`).
- `src/lib/draft-store.svelte.ts` debounces in-progress request/collection edits before they're committed.

Both of these mean recent edits can sit in memory, not yet on disk, at any given moment. That's what the close handshake below exists to protect.

## The close handshake

Closing the window can't be allowed to just tear down the process while a debounced save is still pending. The flow:

1. Rust intercepts the OS close request. `lib.rs`'s `on_window_event` handler for `CloseRequested` on the main window calls `api.prevent_close()` and emits `app:close-requested` with a `CloseRequest` payload (`commands/lifecycle.rs`), which is `{ hide: true }` on macOS (leave the app running, hide the window) and `{ hide: false }` everywhere else (a close means quit).
2. The frontend (`App.svelte`) listens for `app:close-requested`, runs its unsaved-changes prompt, then calls `flushAllStores()` from `src/lib/lifecycle.ts`. That function flushes the debounced draft save (`flushDraftSave()`) and the pending collection save (`getMessageBus().flushPendingSaves()`) before returning.
3. Once flushed, the frontend either hides the window (macOS) or calls `requestQuit()`, which calls the `quit_app` Rust command.
4. `quit_app` sets `AppState.force_close` (an `AtomicBool` in `state.rs`) before calling `app.exit(0)`, so if the close handler somehow runs again during teardown it doesn't re-trigger the handshake.

## Crash recovery dumps

`commands/recovery.rs` adds a second, independent safety net for unrecoverable crashes (a render error, an uncaught exception, an unhandled promise rejection) rather than a clean quit:

- `save_emergency_data(filename, data)` writes a JSON dump to `<app_data_dir>/nouto/recovery/`, validating the filename (no path separators, no leading dot, under 200 characters) and capping the payload at 10 MB.
- `cleanup_old_recovery_files()` deletes dumps older than 7 days. It runs once at startup, from `setup()` in `lib.rs`, with no IPC round trip needed.
- The frontend side, `src/lib/recovery.ts`, calls `invoke('save_emergency_data', ...)` directly rather than going through `TauriMessageBus` — deliberately, so a crash inside the bus itself doesn't also block the dump from being saved.
- `App.svelte` wraps its main content area (not the titlebar, sidebar, or modals) in a `<svelte:boundary>` that calls `saveEmergencyData()` on a render error and shows a fallback with "Copy details" and "Reload" actions. It also listens for `window.onerror`/`unhandledrejection` globally and saves a dump for those too (throttled to one per 5 seconds), without a UI fallback since there's no reasonable place to show one for an arbitrary event-handler error.

See [error-handling.md](./error-handling.md) for how this fits with the rest of the error-handling story.
