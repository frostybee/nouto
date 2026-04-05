---
title: Storage Modes
description: Choose between monolithic and git-friendly storage in Nouto for solo or team workflows.
sidebar:
  order: 3
---

Nouto supports two storage modes for collections. The default monolithic mode stores everything in a single file. Git-friendly mode splits each collection into its own file, reducing merge conflicts for teams.

<!-- screenshot: settings/storage-mode-toggle.png -->
![VS Code storage mode toggle showing Monolithic and Git-Friendly options with a description of each](/screenshots/settings/storage-mode-toggle.png)

## Monolithic (Default)

All data lives under `.vscode/nouto/`:

```
.vscode/nouto/
  collections.json     # All collections in one file
  history.json
  environments.json
```

Works well for solo use. No setup required.

## Git-Friendly

Each collection gets its own file in a workspace-root directory:

```
.nouto/
  collections/
    abc123.json        # One file per collection
    def456.json
  environments.json
  history.json
  .gitignore           # Auto-generated, excludes history.json
```

Benefits for teams:

- **Fewer merge conflicts**: editing different collections modifies different files
- **Cleaner diffs**: changes to one collection do not touch other files
- **Selective sharing**: commit only the collections you want to share
- **History excluded**: `.gitignore` automatically excludes personal request history

## Switching Modes

### To Git-Friendly

Run **Nouto: Switch to Git-Friendly Storage** from the Command Palette. Nouto migrates all collections, history, and environments to the new directory structure.

### To Monolithic

Run **Nouto: Switch to Monolithic Storage** from the Command Palette. All individual collection files are combined back into a single `collections.json`.

## File Watching

In git-friendly mode, Nouto watches the collection files for external changes. If a teammate pulls new changes that modify a collection file, Nouto detects the update and reloads automatically. If a conflict is detected (local changes overlap with external changes), Nouto offers options: keep local, overwrite with external, or merge.

## Desktop App

The Desktop app uses its own storage path with a similar structure. Storage mode switching is a VS Code-only feature since the Desktop app always uses its own directory.
