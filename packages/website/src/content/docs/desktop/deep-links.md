---
title: Deep links
description: Open the Nouto desktop app from a terminal, browser, or another application with a nouto:// URL.
sidebar:
  order: 0
---

The Nouto desktop app registers the `nouto://` URL scheme with the operating system. Opening a `nouto://` URL starts Nouto, or brings the running window to the front.

## Open Nouto from a terminal

Pass a `nouto://` URL to your system's URL opener.

On macOS:

```bash
open nouto://
```

On Windows, in PowerShell or Command Prompt:

```powershell
start nouto://
```

On Linux:

```bash
xdg-open nouto://
```

You can also put a `nouto://` link in a web page or document to open Nouto when someone clicks it.

## What a deep link does

A deep link opens or focuses Nouto. Deep links can't open a specific request, collection, or environment.

Nouto runs as a single instance. Opening a deep link, or launching the app again, while Nouto is running brings the existing window to the front instead of starting a second copy.

## OAuth 2.0 redirects

The OAuth 2.0 Authorization Code flow doesn't use deep links. The desktop app receives the redirect on a temporary local server at `http://127.0.0.1` on a random port. See [OAuth 2.0](/authentication/oauth2/).
