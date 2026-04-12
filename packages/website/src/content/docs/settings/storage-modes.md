---
title: Storage Modes
description: Choose between global and workspace storage in Nouto for solo or team workflows.
sidebar:
  order: 3
---

Nouto supports two storage modes for collections. Global mode (the default) keeps everything in VS Code's private extension storage. Workspace mode stores each request as its own file inside your project, which produces clean git diffs and avoids merge conflicts when working in a team.

<!-- screenshot: settings/storage-mode-toggle.png -->
![VS Code storage mode toggle showing Global and Workspace options with a description of each](/screenshots/settings/storage-mode-toggle.png)

## Global (Default)

All data lives in VS Code's global extension storage, outside your project:

```
<vscode-global-storage>/
  collections.json     # All collections in one file
  environments.json
```

No setup required. Works well for solo use when you don't need to share collections via git.

## Workspace

Each collection becomes a directory inside `.nouto/` at your workspace root. Requests are individual JSON files, and folders become subdirectories:

```
.nouto/
  .gitignore
  environments.json
  collections/
    My API/
      _collection.json       # Collection metadata (auth, variables, etc.)
      _order.json            # Item ordering: ["Login", "auth", "users"]
      Login.json             # Request file
      auth/
        _folder.json         # Folder metadata (auth inheritance, headers, etc.)
        _order.json
        Register.json
      users/
        _folder.json
        _order.json
        Get User.json
        Create User.json
        admin/
          _folder.json
          _order.json
          Ban User.json
    Payment Service/
      _collection.json
      _order.json
      Create Payment.json    # Top-level request (no folder)
```

Each directory contains:

- `_collection.json` / `_folder.json`: metadata (name, id, auth, headers, variables, color, icon)
- `_order.json`: an array of slugs that controls the display order of items in the sidebar
- `*.json` files: individual saved requests (the `type` field is omitted on disk and re-added on load)

Benefits for teams:

- **Fewer merge conflicts**: editing different collections or requests modifies different files
- **Cleaner diffs**: only the changed request file appears in `git diff`
- **Selective sharing**: commit only the collections you want teammates to have
- **Auto-detected**: if a teammate clones a repo that already has `.nouto/collections/`, Nouto switches to workspace mode automatically

The Drafts collection and environments always stay in global storage regardless of mode.

## Switching Modes

### To Workspace Storage

Run **Nouto: Switch to Workspace Storage (.nouto/)** from the Command Palette. Nouto migrates all collections to `.nouto/collections/` and creates a `.gitignore` in `.nouto/` automatically.

### To Global Storage

Run **Nouto: Switch to Global Storage** from the Command Palette. All individual request files are merged back into a single `collections.json` in VS Code global storage.

You can also set the mode directly in settings:

```json
"nouto.storage.mode": "workspace"  // or "global"
```

## File Watching

In workspace mode, Nouto watches `.nouto/collections/` for external changes. If a teammate pulls changes that modify a collection directory, Nouto detects the update and reloads automatically.

## Desktop App

The desktop app always uses workspace-style per-request storage. Storage mode switching is a VS Code-only feature.
