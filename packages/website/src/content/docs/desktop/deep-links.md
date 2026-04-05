---
title: Deep Links
description: Use nouto:// URLs to open the Nouto desktop app from the terminal, browser, or other applications.
sidebar:
  order: 0
---

The Nouto desktop app registers the `nouto://` URL scheme. Clicking or opening a `nouto://` URL launches the app and performs the specified action.

## URL Scheme

```
nouto://<action>/<parameters>
```

## OAuth Callbacks

The primary use case for deep links is OAuth 2.0 authorization callbacks. When you use OAuth 2.0 in the desktop app, Nouto registers a callback URL using the `nouto://` scheme. After authorizing in the browser, the OAuth provider redirects back to Nouto via the deep link, and the app receives the authorization code to complete the token exchange.

This replaces the local callback server approach used in the VS Code extension.

## Opening from Terminal

You can open Nouto from the command line using the deep link scheme:

**macOS:**
```bash
open nouto://
```

**Windows:**
```bash
start nouto://
```

**Linux:**
```bash
xdg-open nouto://
```

## Single Instance

Deep links always route to the running Nouto instance. If Nouto is not running, the OS launches it first. The `tauri-plugin-single-instance` plugin ensures only one instance is active, so deep links never create a duplicate window.
