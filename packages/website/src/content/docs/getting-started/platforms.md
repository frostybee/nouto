---
title: VS Code vs desktop
description: Compare the Nouto VS Code extension with the standalone desktop app, including storage, the HTTP engine, and desktop-only features.
---

The VS Code extension and the desktop app share the same request editor and core features: HTTP requests, GraphQL (including subscriptions), WebSocket, Server-Sent Events, gRPC, collections, environments, authentication, scripts, assertions, the collection runner, the mock server, benchmarking, and code generation. They differ in where data is stored, which HTTP engine sends requests, and how they integrate with the operating system.

## VS Code extension

The extension adds a **Nouto** view to the activity bar, and requests open as editor tabs next to your code.

- Requests go through the Node.js `http` and `https` modules. Nouto decompresses gzip, deflate, and Brotli responses.
- Collections live in VS Code's global extension storage by default. Switch to workspace storage to write each request as its own file under `.nouto/collections/` in your project. See [Storage modes](/settings/storage-modes).
- Environments, history, and trash stay in global extension storage in both storage modes.
- In workspace storage, Nouto watches `.nouto/collections/` and reloads when files change outside Nouto, for example after a `git pull`.
- Nouto uses the colors of the active VS Code theme.
- The extension updates through the VS Code Marketplace like any other extension.

## Desktop app

The desktop app is built with Tauri 2.0 and a Rust backend.

- Requests go through reqwest, a Rust HTTP client. Nouto decompresses gzip, deflate, Brotli, and zstd responses.
- Data lives in the app data directory by default. When you open a project folder, collections and environments are stored in `.nouto/` inside that folder, using the same per-request file layout as VS Code workspace storage. Global variables stay in the app data directory.
- While a project folder is open, Nouto watches it and reloads when files change outside Nouto.
- You pick the theme in Settings. The desktop app has 26 built-in themes, a catalog of 65 VS Code themes, theme file import, and a custom theme editor. See [Themes](/settings/themes).
- The app registers the `nouto://` URL scheme. Opening a `nouto://` URL starts Nouto or brings it to the front. See [Deep links](/desktop/deep-links).
- A built-in updater installs new releases. See [Auto-update](/desktop/auto-update).
- The **Desktop** section of Settings controls close to tray, system notifications, launch at login, and a system-wide shortcut that brings Nouto to the front.

## Feature differences

This table lists only the features that differ between the two apps.

| Feature | VS Code | Desktop |
|---------|---------|---------|
| HTTP engine | Node.js `http` and `https` | reqwest (Rust) |
| Response decompression | gzip, deflate, Brotli | gzip, deflate, Brotli, zstd |
| Default storage | VS Code global extension storage | App data directory |
| Project storage | `.nouto/` in the workspace, opt-in | `.nouto/` in an opened project folder |
| Environments in project storage | No, always global | Yes |
| Theme | Follows the VS Code theme | Built-in themes, VS Code theme catalog, custom themes |
| Deep links (`nouto://`) | No | Yes |
| Updates | VS Code Marketplace | Built-in updater |
| Tray, OS notifications, launch at login | No | Yes |

## Nouto JSON Explorer extension

The JSON Explorer also ships on its own as the [Nouto JSON Explorer](/json-explorer) VS Code extension. It uses the same viewer as the two REST clients, with tree and table views, search, query and JSONPath filtering, compare, and type generation. It has no request, collection, or environment features. Install it if you want the JSON viewer in VS Code without the REST client.
