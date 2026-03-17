---
title: VS Code vs Desktop
description: Understand the differences between the VS Code extension and the standalone desktop app.
---

Sendry runs on two platforms with a shared UI and feature set.

## VS Code Extension

- Runs inside your editor as a webview panel
- Uses Node.js (axios) for HTTP requests
- Stores data in the `.vscode/nouto/` workspace folder
- Communicates via VS Code's `postMessage` API

**Best for:** developers who live in VS Code and want API testing without leaving their editor.

## Desktop App (Tauri 2.0)

- Standalone application built with Tauri 2.0 (Rust backend)
- Uses reqwest (Rust) for HTTP requests with gzip/brotli/deflate/zstd support
- Stores data via browser localStorage
- Communicates via Tauri's `invoke` and `emit` APIs

**Best for:** developers who want a dedicated, lightweight API client outside of VS Code.

## Feature Comparison

| Feature | VS Code | Desktop |
|---|---|---|
| HTTP Requests | Yes | Yes |
| GraphQL | Yes | Yes |
| WebSocket | Yes | Yes |
| SSE | Yes | Yes |
| Collections | Yes | Yes |
| Environments | Yes | Yes |
| Assertions | Yes | Yes |
| Mock Server | Yes | Yes |
| Benchmarking | Yes | Yes |
| Code Generation | Yes | Yes |
| Import/Export | Yes | Yes |
