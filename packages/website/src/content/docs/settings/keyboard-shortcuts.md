---
title: Keyboard Shortcuts
description: Complete list of Nouto keyboard shortcuts with customization instructions.
sidebar:
  order: 2
---

All shortcuts are customizable in **Settings > Shortcuts**. Record new bindings, detect conflicts, and reset to defaults.

## App-Level

| Action | Default | Notes |
|--------|---------|-------|
| Undo | `Ctrl+Z` | Request state and collection tree undo |
| Redo | `Ctrl+Shift+Z` | |
| New Request | `Ctrl+N` | |
| Close Panel | `Ctrl+W` | |
| Focus URL Bar | `Ctrl+L` | |
| Toggle Layout | `Alt+L` | Switch horizontal/vertical split |
| Toggle History | `Ctrl+Shift+H` | Open/close history drawer |
| Command Palette | `Ctrl+P` | |
| Reveal Active Request | (unbound) | Scroll sidebar to the active request |

## Request Panel

| Action | Default |
|--------|---------|
| Send Request | `Ctrl+Enter` |
| Cancel Request | `Escape` |
| Save to Collection | `Ctrl+S` |
| Duplicate Request | `Ctrl+D` |
| Re-send Last | `Ctrl+Shift+R` |
| Query Params Tab | `Ctrl+1` |
| Headers Tab | `Ctrl+2` |
| Auth Tab | `Ctrl+3` |
| Body Tab | `Ctrl+4` |
| Tests Tab | `Ctrl+5` |
| Scripts Tab | `Ctrl+6` |
| Notes Tab | `Ctrl+7` |

## Response Panel

| Action | Default |
|--------|---------|
| Find in Response | `Ctrl+F` |
| Body Tab | `Alt+1` |
| Headers Tab | `Alt+2` |
| Cookies Tab | `Alt+3` |
| Timing Tab | `Alt+4` |
| Timeline Tab | `Alt+5` |
| Toggle Word Wrap | `Alt+W` |

## Customizing Shortcuts

1. Open **Settings > Shortcuts**.
2. Click a shortcut row to select it.
3. Click **Record** and press the new key combination.
4. If the new binding conflicts with an existing shortcut, a warning appears.
5. Click **Reset** on any shortcut to restore its default.

## Undo/Redo Behavior

`Ctrl+Z` and `Ctrl+Shift+Z` operate on two undo stacks: request state changes and collection tree changes. When a CodeMirror editor is focused (script editor, JSON body, GraphQL query), `Ctrl+Z` triggers the editor's own undo instead.

Rapid typing in URL, headers, params, and body fields is coalesced into a single undo entry with 500ms debounce.

## Mac Support

On macOS, `Ctrl` is treated as equivalent to `Cmd`. All shortcuts listed above work with either modifier.
