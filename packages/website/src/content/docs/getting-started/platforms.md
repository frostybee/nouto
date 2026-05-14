---
title: VS Code vs Desktop
description: Understand the differences between the VS Code extension and the standalone desktop app.
---

Nouto runs on two platforms with a shared UI and core feature set. Both support HTTP requests, GraphQL over HTTP, GraphQL subscriptions, WebSockets, SSE, gRPC, collections, environments, authentication, scripts, assertions, the mock server, benchmarks, and code generation. The differences are in storage and operating system integration.

## VS Code Extension

Runs as a webview panel inside your editor. You access it from the activity bar without leaving VS Code.

**HTTP client:** Node.js via axios

**Storage location:** VS Code global extension storage by default

**Storage modes:** Global and workspace `.nouto/collections/`. See [Storage Modes](/settings/storage-modes).

**File watching:** In workspace mode, Nouto watches collection files for external changes and reloads automatically.

Best for developers who want API testing integrated into their editor workflow, with collection files stored alongside their code.

## Desktop App

A standalone application built with Tauri 2.0 and a Rust backend.

**HTTP client:** Rust via reqwest, with native gzip, brotli, deflate, and zstd decompression

**Storage location:** App data directory by default, or `.nouto/` in an opened project folder

**Projects:** Desktop projects use the same per request `.nouto/collections/` layout as VS Code workspace storage.

**Deep links:** Supports the `nouto://` URL scheme for OAuth callbacks and external launches. See [Deep Links](/desktop/deep-links).

**Auto-update:** Built-in update checker. See [Auto-Update](/desktop/auto-update).

Best for developers who want a dedicated, lightweight API client that works outside of VS Code, or who need the desktop app's native HTTP capabilities.

## Feature Differences

| Feature | VS Code | Desktop |
|---------|---------|---------|
| Global storage | Yes | Yes |
| Project `.nouto/` storage | Yes | Yes |
| File watching for project files | Yes | Yes |
| Deep links (`nouto://`) | No | Yes |
| Auto-update | No | Yes |
| Native compression (brotli, zstd) | No | Yes |
