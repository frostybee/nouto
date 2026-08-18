# Error handling

## Rust: `AppError`

`packages/desktop/src-tauri/src/error.rs` defines a single `AppError` enum used as the error type for every Tauri command: `Http`, `Io`, `Serde` (all `#[from]`-convertible via `?`), plus `Script`, `OAuth`, `Storage`, `Dialog`, `Grpc`, and a catch-all `Other(String)`. It implements `Serialize` by converting to its `Display` string, so a command that returns `Result<T, AppError>` surfaces a plain error message to the frontend when it fails; `invoke()` on the JS side rejects with that string.

Prefer an existing variant over adding a new one. `Other(String)` covers a one-off error message; the named variants exist for cases multiple call sites need to match on or where the source error type has a natural `#[from]` conversion.

## Logging

`tauri-plugin-log` is registered in `lib.rs` (Stdout + a log-directory file target, plus Webview in dev builds). Rust code logs with `log::{info,warn,error,debug}!` rather than `println!`/`eprintln!`.

On the frontend, `packages/desktop/src/lib/logger.ts` is the only sanctioned place to call `console.*` (ESLint's `no-console` rule is off for that one file). In dev it logs to the browser console; in production it forwards `warn`/`error` calls to the Rust log file through `tauri-plugin-log`, lazily imported so nothing breaks if the plugin isn't ready yet.

## The render-error boundary

`App.svelte` wraps its main content area in Svelte 5's `<svelte:boundary onerror={handleRenderError}>`. If a component inside throws during render, the boundary shows a fallback (error message, "Copy details", "Reload") instead of taking down the whole window. The sidebar, titlebar, and modals live outside the boundary, so navigation still works even if one panel crashes.

`handleRenderError` logs the error and calls `saveEmergencyData()` (see [persistence-and-recovery.md](./persistence-and-recovery.md)) so a crash produces a dump on disk, not just a log line that scrolls away.

A `<svelte:boundary>` only catches errors thrown during rendering. `App.svelte` also registers `window.addEventListener('error', ...)` and `window.addEventListener('unhandledrejection', ...)` to catch everything else (event-handler throws, unhandled promise rejections) and log + dump those too, throttled to avoid flooding the recovery folder on a repeating failure.

## User-facing notifications

`showNotification(level, message)` (from `@nouto/ui/stores/notifications.svelte`, re-exported through the shared onboarding/settings stores) is the standard way to surface a recoverable error or warning to the user as a toast, as opposed to a hard crash. It's used throughout `App.svelte` for things like a failed import, an invalid JSON paste, or a storage-recovery notice.
