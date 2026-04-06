---
title: Backup & Restore
description: Back up your entire Nouto workspace to a single file and restore it on any machine.
sidebar:
  order: 7
---

Nouto can export your entire workspace (collections, environments, cookies, history, and more) to a single `.nouto-backup` file. Restore it on the same machine or a different one to recover your full workspace state.

<!-- screenshot: import-export/backup-dialog.png -->
![Backup dialog showing 9 data type checkboxes: Collections, Environments, Cookies, History, Drafts, Trash, Runner History, Mock Server, Settings, with a Backup button](/screenshots/import-export/backup-dialog.png)

## Creating a Backup

1. Open the Command Palette and run **Backup Workspace**.
2. Select which data types to include (all 9 are checked by default).
3. Choose a save location.
4. Nouto writes a `.nouto-backup` file.

## Data Types

| Data type | What it includes |
|-----------|-----------------|
| **Collections** | All collections with folders, requests, auth, headers, variables, scripts, assertions, notes |
| **Environments** | All environments, global variables, active environment |
| **Cookies** | All cookie jars with cookies |
| **History** | Request history entries (up to 10,000) |
| **Drafts** | Unsaved request drafts |
| **Trash** | Soft-deleted items |
| **Runner History** | Collection runner results |
| **Mock Server** | Routes and port configuration |
| **Settings** | Themes, shortcuts, UI preferences |

## Restoring a Backup

1. Open the Command Palette and run **Restore Workspace**.
2. Select the `.nouto-backup` file.
3. Nouto shows a confirmation dialog listing what will be restored.

<!-- screenshot: import-export/restore-confirm.png -->
![Restore confirmation dialog showing the backup contents and a warning about the pre-restore snapshot](/screenshots/import-export/restore-confirm.png)

### Pre-Restore Safety Snapshot

Before restoring, Nouto automatically takes a snapshot of your current workspace state. If the restore produces unexpected results, you can revert to the snapshot.

## Cross-Platform

Backup files are compatible across VS Code and the Desktop app. Back up from VS Code and restore on Desktop, or vice versa.

## When to Use Backup

- Moving to a new machine
- Reinstalling VS Code or the Desktop app
- Sharing a complete workspace setup with a colleague
- Periodic safety backups before major changes
