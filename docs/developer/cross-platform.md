# Cross-platform notes

## Window chrome

Windows and Linux use a custom titlebar drawn by the app (window decorations are disabled in `tauri.conf.json` and the app draws its own controls). macOS instead uses the native traffic-light buttons: `packages/desktop/src-tauri/tauri.macos.conf.json` overrides the main window with `titleBarStyle: "Overlay"`, `hiddenTitle: true`, and `decorations: true`, which shows the native macOS window controls with the content area extending underneath the title bar.

## Native theme sync

`src/lib/native-theme.ts`'s `syncNativeTheme()` calls `getCurrentWindow().setTheme('light' | 'dark')` so system dialogs and the title bar match the app's theme. This call is wrapped in a try/catch because Linux's window backend can no-op or error on `setTheme` depending on the desktop environment; a failure there is not fatal.

## Tray icon

`src-tauri/src/tray.rs` builds the tray icon and its Show/Quit menu. On macOS, tray icons are conventionally monochrome "template" images that the OS recolors for light/dark menu bars (`icon_as_template`); the current tray icon does not yet use a dedicated template asset for that, tracked as a follow-up in the source comment.

## Logging on Linux

`tauri-plugin-log`'s Webview log target is excluded on Linux (`#[cfg(not(target_os = "linux"))]` in `lib.rs`). WebKitGTK's webview doesn't exist yet during `setup()`, and calling `app.emit()` before it does deadlocks on the IPC socket. Linux still gets the Stdout and log-directory file targets.

## CI system dependencies

The Rust CI job (`.github/workflows/desktop-ci.yml`) builds on Ubuntu and Windows. The Ubuntu runner installs WebKitGTK and its related packages before building, since Tauri's Linux backend links against them: `libwebkit2gtk-4.1-dev`, `libappindicator3-dev`, `librsvg2-dev`, `patchelf`, `libgtk-3-dev`, `libsoup-3.0-dev`, `libjavascriptcoregtk-4.1-dev`. Windows needs no equivalent step. macOS isn't covered by the Rust CI job; the release workflow (`release.yml`) builds macOS bundles separately as part of the release matrix.
