---
title: Settings
description: Reference for every section of the Nouto Settings page, including network defaults, storage, OpenAPI, shortcuts, and desktop-only options.
sidebar:
  order: 0
---

The Settings page holds Nouto's app-wide preferences. Request-level settings, such as a timeout on the request's **Settings** tab, override the defaults set here.

## Open Settings

- In VS Code, click the gear icon in the API Testing view's title bar, or run **Nouto: Settings** from the Command Palette.
- In the desktop app, click the gear icon in the top toolbar or **Settings** in the left rail. Settings opens in its own window.

The sections available depend on the platform:

| Section | VS Code | Desktop |
|---------|---------|---------|
| Appearance | No | Yes |
| Interface | No | Yes |
| Desktop | No | Yes |
| General | Yes | Yes |
| Network | Yes | Yes |
| Storage | Yes | Yes |
| OpenAPI | Yes | Yes |
| Shortcuts | Yes | Yes |
| About | Yes | Yes |

## Appearance

Desktop only. Pick one of 26 built-in themes or **System (Auto)**, which follows the operating system's light or dark preference. From this section you can also browse the VS Code theme catalog, import a theme file, and customize a theme. See [Themes](/settings/themes).

In VS Code, Nouto uses the colors of the active VS Code theme instead.

## Interface

Desktop only.

- **Interface font** and **Size** set the font for the app's UI.
- **Editor font** and **Size** set the font for the code editors. Hold `Ctrl` (or `Cmd` on macOS) and scroll over a code editor to step the editor font size up or down.
- **Minimap** controls when response viewers show a minimap: **Auto (show for large documents)**, **Always**, or **Never**.

## Desktop

Desktop only.

| Setting | Effect |
|---------|--------|
| **Close to tray** | Closing the window keeps Nouto running in the system tray. Quit from the tray menu. |
| **System notifications** | Shows an OS notification when a collection run, benchmark, or update check finishes while Nouto is in the background. **Send test notification** checks that notifications appear. |
| **Launch at login** | Starts Nouto when you sign in to your computer. |
| **Bring Nouto to front** | A system-wide shortcut that shows and focuses Nouto from any app. The shortcut must include `Ctrl`, `Alt`, or `Meta`. |
| **Diagnostics** | **Copy Diagnostics** copies system and app information for bug reports. |
| **Crash Reports** | Appears only when crash reports exist on disk. **Clear Crash Reports** deletes them. |

## General

| Setting | Effect |
|---------|--------|
| **Minimap** | VS Code only. Same options as the desktop **Interface** section. |
| **Auto-correct URLs** | Fixes malformed URLs automatically instead of showing suggestions. Off by default. |
| **Save Response Bodies** | Has no effect. Request history never stores response bodies, whatever this setting is. See [Request history](/tools/request-history). |
| **Environment Variables** | **Open Variables Tab** opens the Environments panel. |
| **Onboarding** | **Reset Onboarding Hints** shows the welcome screen and contextual hints again. |

## Network

The Network section sets defaults for every request. Settings on an individual request override them.

| Setting | Effect |
|---------|--------|
| **Verify SSL Certificates** | Verifies server TLS certificates. On by default. Turn it off to accept self-signed or invalid certificates. See [SSL certificates](/building-requests/ssl-certificates). |
| **Client Certificate (mTLS)** | Default certificate file, key file, key passphrase, and custom CA certificate for mutual TLS. |
| **Enable Global Proxy** | Sends requests through a proxy. Set the protocol (HTTP, HTTPS, or SOCKS5), host, port, optional username and password, and a comma-separated **No Proxy** list of hosts to bypass. See [Proxy](/building-requests/proxy). |
| **Default Request Timeout** | Timeout in milliseconds. Leave it empty to use the default of 30000 (30 seconds). Enter `0` for no timeout. |
| **Follow Redirects** | Follows HTTP 3xx redirects. On by default. |
| **Max Redirects** | Maximum number of redirects to follow, from 1 to 100. Leave it empty to use the default of 10. |

## Storage

In VS Code, **Storage Mode** switches between **Global** and **Workspace (.nouto/)** storage. Workspace storage requires an open folder. See [Storage modes](/settings/storage-modes).

In the desktop app, the Storage section shows whether data is in the app data directory or in a project folder, with buttons to **Open Project Directory** or **Close Project**.

On both platforms, **Export Backup** saves collections, environments, history, and settings to a file, and **Restore from Backup** loads one. Secrets stored in the OS keychain are not included in a backup, so re-enter them after you restore. See [Backup and restore](/import-export/backup-restore).

## OpenAPI

These settings control the [OpenAPI editor](/openapi).

| Setting | Effect |
|---------|--------|
| **Enable OpenAPI IntelliSense** | Suggests properties, enum values, and `$ref` targets as you type, and shows documentation on hover. |
| **Resolve external $refs** | Follows `$ref` values that point to other local files for navigation, diagnostics, and the preview. Never accesses the network. |
| **Enable OpenAPI linting** | Runs Nouto's built-in lint rules and shows their findings as diagnostics. |
| **Sort outline alphabetically** | Sorts the outline's Paths, Tags, Components, Servers, and Webhooks alphabetically instead of in document order. |
| **Lint rules** | Sets each rule to **Off**, **Warning**, or **Error**. See [Linting](/openapi/linting). |

All four toggles are on by default except **Sort outline alphabetically**.

## Shortcuts

Lists every customizable keyboard shortcut. Click a shortcut to record a new key combination. See [Keyboard shortcuts](/settings/keyboard-shortcuts).

## About

Shows the Nouto version and license, with links to the GitHub repository, bug reports, feature requests, and the changelog.
