---
title: Backup and restore
description: Back up your Nouto collections, environments, history, and settings to one file, and restore them on the same machine or another one.
sidebar:
  order: 7
---

A backup saves your Nouto data to one file, so you can move to a new machine, reinstall, or keep a copy before a large change. Restoring a backup replaces your current data with the data in the file.

:::caution
Backups don't include secrets stored in your OS keychain, such as secret variable values, passwords, and tokens. Re-enter them after you restore. See [Secrets](/variables/secrets).
:::

## Create a backup

Open **Settings**, go to the **Storage** section, and click **Export Backup**. In VS Code, you can also run **Nouto: Export Backup** from the Command Palette or the `...` menu at the top of the Nouto sidebar.

In VS Code, Nouto then asks which data to include. Every item is selected by default:

| Item | Contents |
|------|----------|
| Collections | Collections with their folders, requests, auth, headers, variables, scripts, assertions, and notes |
| Environments | Environments, global variables, and the active environment |
| Cookies | Cookie jars and their cookies |
| History | Request history |
| Drafts | Unsaved request drafts |
| Trash | Deleted items waiting in Trash |
| Runner history | Collection runner results |
| Mock server routes | Mock server routes and port |
| Settings | Settings from the Nouto Settings page |

Choose where to save the file. VS Code writes a `.nouto-backup` file.

The desktop app doesn't ask which data to include. It writes a `.zip` file with collections, environments, cookies, history, Trash, runner history, and settings.

## Restore a backup

1. Open **Settings**, go to the **Storage** section, and click **Restore from Backup**. In VS Code, you can also run **Nouto: Restore from Backup**.
2. Select the backup file.
3. In VS Code, review the summary of what the backup contains and click **Restore**. The desktop app restores without a confirmation step.

Nouto replaces your current data with each section in the backup. Sections that the backup doesn't contain stay as they are.

### Undo a restore

Before it restores, Nouto saves your current data to `pre-restore-snapshot.nouto-backup` in its storage directory. To go back, restore that file with **Restore from Backup**. Each restore overwrites the previous snapshot, so copy the file somewhere else if you need to keep it.

## Move data between VS Code and the desktop app

The desktop app restores VS Code backups. It skips the drafts and mock server routes in them.

VS Code can't restore a desktop backup. It reads only `.nouto-backup` and `.json` files, and the desktop app writes `.zip` files. To move collections from the desktop app to VS Code, export them in the Nouto format and import them. See [Exporting](/import-export/exporting).
