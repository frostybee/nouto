---
title: Installation
description: Install Nouto, an open-source REST client, as a VS Code extension or as a desktop app for Windows, macOS, and Linux.
---

Nouto is an open-source REST client and an alternative to Postman and Thunder Client. It runs as a VS Code extension or as a standalone desktop app. Neither requires an account, neither sends telemetry, and both store your data on your machine.

## Install the VS Code extension

The extension requires VS Code 1.74 or later.

1. Open the Extensions view in VS Code (`Ctrl+Shift+X`, or `Cmd+Shift+X` on macOS).
2. Search for **Nouto**.
3. Click **Install**.

To install from a terminal instead, run:

```bash
code --install-extension frostybee-dev.nouto
```

After installation, the Nouto icon appears in the activity bar.

## Install the desktop app

Download the build for your operating system from the [Nouto releases page on GitHub](https://github.com/frostybee/nouto/releases). Release builds are published for:

- Windows (x64)
- macOS (Apple silicon and Intel)
- Linux (x64)

The desktop app checks for new releases shortly after it starts and offers to install them. See [Auto-update](/desktop/auto-update).

## Next steps

- Send your first request with the [Quick start](/getting-started/quick-start/).
- If you use Postman or Thunder Client, import your collections. See [From Postman](/import-export/from-postman) and [From Thunder Client](/import-export/from-thunder-client).
- To choose between the extension and the desktop app, see [VS Code vs desktop](/getting-started/platforms).
