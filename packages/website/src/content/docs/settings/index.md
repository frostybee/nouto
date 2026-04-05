---
title: Settings
description: Configure Nouto's appearance, network behavior, storage, and UI preferences.
sidebar:
  order: 0
---

The Settings page is accessible from the gear icon in the response header bar, or from the Command Palette (**Open Settings**).

<!-- screenshot: settings/settings-overview.png -->
![Settings page showing tabs for Appearance, Network, Storage, Shortcuts, and About](/screenshots/settings/settings-overview.png)

## Settings Sections

### Appearance

- **Theme**: choose from 26 themes (see [Themes](/settings/themes))
- **UI font and size**: customize the interface font
- **Editor font and size**: customize the CodeMirror editor font
- **Minimap**: show, hide, or auto-detect based on response length

### Network

- **Global proxy**: protocol, host, port, credentials, bypass list (see [Proxy](/building-requests/proxy))
- **SSL verification**: global toggle for certificate verification (see [SSL](/building-requests/ssl-certificates))
- **Default timeout**: default request timeout in milliseconds
- **Follow redirects**: global toggle and max redirect count

### Storage (VS Code)

- **Storage mode**: switch between monolithic and git-friendly storage (see [Storage Modes](/settings/storage-modes))
- **Save response bodies**: toggle whether response bodies are saved to history

### Shortcuts

- View and customize all 27 keyboard shortcuts (see [Keyboard Shortcuts](/settings/keyboard-shortcuts))
- Record new bindings, detect conflicts, reset to defaults

### About

- Nouto version, build info, and links
