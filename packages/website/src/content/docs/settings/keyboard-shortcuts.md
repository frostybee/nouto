---
title: Keyboard shortcuts
description: Default Nouto keyboard shortcuts for requests, responses, and the app, and how to change them.
sidebar:
  order: 2
---

The tables below list the default bindings shown in **Settings > Shortcuts**, grouped by the same scopes. To change a binding, see [Change a shortcut](#change-a-shortcut).

On macOS, every binding that uses `Ctrl` also responds to `Cmd`, so `Cmd+Enter` sends a request.

## App

| Action | Default | Notes |
|--------|---------|-------|
| New Request | `Ctrl+N` | |
| Close Panel | `Ctrl+W` | Closes the current request tab |
| Focus URL Bar | `Ctrl+L` | Selects the URL text |
| Toggle Layout | `Alt+L` | Switches between side-by-side and stacked request and response panes |
| Command Palette | `Ctrl+P` | Desktop. In VS Code, press `Ctrl+K Ctrl+K`. See [Command palette](/tools/command-palette) |
| Toggle Sidebar | `Ctrl+B` | Desktop only |
| Reveal Active Request | Unbound | Scrolls the sidebar to the open request |
| Undo | `Ctrl+Z` | See [Undo and redo](#undo-and-redo) |
| Redo | `Ctrl+Shift+Z` | |

## Request

| Action | Default |
|--------|---------|
| Send Request | `Ctrl+Enter` |
| Cancel Request | `Escape` |
| Save to Collection | `Ctrl+S` |
| Duplicate Request | `Ctrl+D` |
| Re-send Request | `Ctrl+Shift+R` |
| Query Params Tab | `Ctrl+1` |
| Headers Tab | `Ctrl+2` |
| Auth Tab | `Ctrl+3` |
| Body Tab | `Ctrl+4` |
| Tests Tab | `Ctrl+5` |
| Scripts Tab | `Ctrl+6` |
| Notes Tab | `Ctrl+7` |

**Save to Collection** saves changes to a request that is already in a collection. To save a new request, click **Save** next to **Send** and pick a collection.

## Response

| Action | Default | Notes |
|--------|---------|-------|
| Find in Response | `Ctrl+F` | Searches the response body while it has focus |
| Response Body Tab | `Alt+1` | |
| Response Headers Tab | `Alt+2` | |
| Response Cookies Tab | `Alt+3` | |
| Response Timing Tab | `Alt+4` | |
| Response Timeline Tab | `Alt+5` | |
| Toggle Word Wrap | `Alt+W` | |

The JSON Explorer has its own fixed shortcuts for search, filtering, view switching, and selection. See [JSON Explorer keyboard shortcuts](/response/json-explorer#keyboard-shortcuts).

## Fixed shortcuts

These shortcuts don't appear in **Settings > Shortcuts** and can't be changed there.

In VS Code, the extension registers these commands as VS Code keybindings. Change them in VS Code's own Keyboard Shortcuts editor.

| Command | Default | Active when |
|---------|---------|-------------|
| **Nouto: New Request** | `Ctrl+N` | The Nouto sidebar is the active view |
| **Nouto: New Collection** | `Ctrl+Alt+N` | The Nouto sidebar is the active view |
| **Nouto: Duplicate Selected Request** | `Ctrl+D` | The Nouto sidebar has focus |
| **Nouto: Search Requests** | `Ctrl+K Ctrl+K` | Always |
| **Nouto: Import from cURL** | `Ctrl+U` | Always |

In the desktop app, `Ctrl+Tab` and `Ctrl+Shift+Tab` switch to the next and previous request tab.

## Change a shortcut

1. Open **Settings > Shortcuts**.
2. Click the binding you want to change. The binding shows **Press keys...**.
3. Press the new key combination. Pressing a modifier key on its own doesn't record anything. To stop without changing the binding, click anywhere else.

When two actions share a binding, both rows are highlighted and a warning appears above the table. A reset icon appears next to each binding you changed. Click it to restore that default, or click **Reset All to Defaults** to restore every binding.

In VS Code, Nouto stores your changes in the `nouto.shortcuts` setting.

## Undo and redo

`Ctrl+Z` and `Ctrl+Shift+Z` work on two separate histories: edits to the current request, and changes to the collection tree such as adding, renaming, moving, duplicating, or deleting items. The collection tree history keeps the last 20 changes. When a code editor has focus, such as the script editor or a JSON body, `Ctrl+Z` undoes inside that editor instead.

Typing in the URL, params, headers, body, scripts, or notes becomes a single undo step until you pause for 500 ms.
