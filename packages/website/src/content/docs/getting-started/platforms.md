---
title: VS Code vs Desktop
description: Understand the differences between the VS Code extension and the standalone desktop app.
---

Nouto runs on two platforms with a shared UI and core feature set. Both support HTTP requests, collections, environments, authentication, scripts, assertions, the mock server, and code generation. The differences are in how they integrate with your system.

## VS Code Extension

Runs as a webview panel inside your editor. You access it from the activity bar without leaving VS Code.

**HTTP client:** Node.js via axios  
**Storage location:** `.vscode/nouto/` inside the current workspace folder  
**Storage modes:** Monolithic (default) and Git-Friendly. See [Storage Modes](/settings/storage-modes).  
**File watching:** In Git-Friendly mode, Nouto watches collection files for external changes (e.g., after a `git pull`) and reloads automatically.

Best for developers who want API testing integrated into their editor workflow, with collection files stored alongside their code.

## Desktop App

A standalone application built with Tauri 2.0 and a Rust backend.

**HTTP client:** Rust via reqwest, with native gzip, brotli, deflate, and zstd decompression  
**Storage location:** App data directory (`%APPDATA%\nouto` on Windows, `~/Library/Application Support/nouto` on macOS)  
**Deep links:** Supports the `nouto://` URL scheme for OAuth callbacks and external launches. See [Deep Links](/desktop/deep-links).  
**Auto-update:** Built-in update checker. See [Auto-Update](/desktop/auto-update).

Best for developers who want a dedicated, lightweight API client that works outside of VS Code, or who need the desktop app's native HTTP capabilities.

## Feature Differences

| Feature | VS Code | Desktop |
|---------|---------|---------|
| Storage mode switching | Yes | No |
| Git-Friendly file watching | Yes | No |
| Deep links (`nouto://`) | No | Yes |
| Auto-update | No | Yes |
| Native compression (brotli, zstd) | No | Yes |
