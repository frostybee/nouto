---
title: Storage modes
description: Store Nouto collections in VS Code global storage or as per-request files in your project for git-friendly team workflows.
sidebar:
  order: 3
---

The VS Code extension can store collections in two places. Global storage, the default, keeps them in VS Code's global extension storage, outside your projects. Workspace storage writes each request as its own file in `.nouto/collections/` at the root of your workspace, so you can commit collections to git and review changes request by request.

## Global storage

Global storage keeps all collections in a single `collections.json` file in VS Code's global extension storage, next to the environments file:

```text
<vscode-global-storage>/
  collections.json     # All collections
  environments.json    # All environments
```

Global storage needs no setup. Use it when you don't share collections through git.

## Workspace storage

Workspace storage turns each collection into a directory inside `.nouto/collections/`. Each request is a JSON file, and each folder is a subdirectory:

```text
.nouto/
  .gitignore
  collections/
    My API/
      _collection.json       # Collection metadata
      _order.json            # Item order: ["Login", "auth", "users"]
      Login.json             # Request
      auth/
        _folder.json         # Folder metadata
        _order.json
        Register.json
      users/
        _folder.json
        _order.json
        Get User.json
        Create User.json
    Payment Service/
      _collection.json
      _order.json
      Create Payment.json
```

The files in each directory have these roles:

- `_collection.json` and `_folder.json` hold metadata such as the name, ID, auth, headers, variables, scripts, notes, color, and icon.
- `_order.json` is an array of file and directory names that sets the order of items in the sidebar.
- Every other `.json` file is a saved request. Nouto names the file after the request.

Because each request is its own file, editing different requests changes different files. A teammate's change to one request doesn't conflict with yours, and `git diff` shows only the requests that changed.

The Drafts collection, environments, history, and trash stay in global storage in both modes.

### Repositories that already use workspace storage

When you open a workspace that already contains `.nouto/collections/`, for example after cloning a repository, Nouto switches to workspace storage automatically.

### File watching

In workspace storage, Nouto watches `.nouto/collections/` for changes made outside Nouto. When you pull changes or edit a request file by hand, Nouto reloads the collections from disk.

## Switch storage modes

Workspace storage requires a folder open in VS Code.

To move your collections into the workspace, run **Nouto: Switch to Workspace Storage (.nouto/)** from the Command Palette and confirm. Nouto writes every collection to `.nouto/collections/` and creates `.nouto/.gitignore`.

To move them back, run **Nouto: Switch to Global Storage** and confirm. Nouto merges the request files back into `collections.json` in global storage.

You can also switch with the **Storage Mode** setting in **Settings > Storage**, or set `nouto.storage.mode` in your VS Code settings:

```jsonc title="settings.json"
{
  "nouto.storage.mode": "workspace" // or "global"
}
```

## Desktop app

The desktop app stores data in its app data directory by default. When you open a project folder, it reads and writes collections in `.nouto/collections/` inside that folder, using the same file layout as VS Code workspace storage. Unlike VS Code, the desktop app also stores environments in the project, in `.nouto/environments.json`. Values of secret variables go to the OS keychain instead of that file. Global variables stay in the app data directory.

Open or close a project folder from **Settings > Storage**. The `nouto.storage.mode` setting applies only to the VS Code extension.
