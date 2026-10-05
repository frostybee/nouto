---
title: Secrets and sensitive data
description: Where Nouto stores environments and secret variables in VS Code and the desktop app, and how to share variables with your team without sharing credentials.
sidebar:
  order: 4
---

Environments often hold API keys, tokens, and passwords. This page explains where Nouto stores variables on each platform, what marking a variable as secret changes, and how to share variable names with your team without sharing the values.

## Where Nouto stores variables

The storage location depends on the platform. In both, environments live outside your project unless you open a folder as a workspace in the desktop app.

### VS Code extension

The extension saves environments and global variables to `environments.json` in VS Code's global storage for the extension, outside your workspace. On Windows, for example, that folder is `%APPDATA%\Code\User\globalStorage\frostybee-dev.nouto\`. Each machine keeps its own copy.

[Workspace storage mode](/settings/storage-modes) moves only collections into the `.nouto/` folder of your workspace. Environments stay in global storage.

### Desktop app

The desktop app saves global variables to `environments.json` in its app data folder:

| Operating system | Folder |
|------------------|--------|
| Windows | `%APPDATA%\com.nouto.app\nouto\` |
| macOS | `~/Library/Application Support/com.nouto.app/nouto/` |
| Linux | `~/.local/share/com.nouto.app/nouto/` |

Environments are saved to the same file, unless you open a folder as a workspace with **Open Folder…** in the workspace menu. While a workspace is open, the desktop app saves its environments to `.nouto/environments.json` inside that folder.

:::caution
If the workspace folder is a Git repository, Git tracks `.nouto/environments.json` unless you ignore it. Non-secret values in that file end up in your repository when you commit it. Mark sensitive values as secret, or add `.nouto/environments.json` to your `.gitignore`.
:::

## Secret variables

Mark a variable as secret to keep its value out of the environments file and off your screen:

1. Open the Environments panel and select the environment, or **Global Variables**.
2. Click the lock icon at the end of the variable's row. Its tooltip reads **Mark as secret**.
3. Click **Save**.

The value field then shows dots instead of the value. To see the value while you edit, click **Reveal value** (the eye icon). In autocomplete, secret values show as `******`.

Nouto stores the value of a secret variable in a separate secure store, and leaves the value empty in `environments.json`:

- The VS Code extension uses VS Code's secret storage, which VS Code encrypts.
- The desktop app uses the operating system keychain: Windows Credential Manager, the macOS Keychain, or a Secret Service provider such as GNOME Keyring on Linux.

In the desktop app, a secret value that contains a `{{variable}}` reference stays in `environments.json`, because Nouto resolves it when you send the request. Keep the real value in the referenced variable and mark that one as secret.

:::caution
In the desktop app, the keychain only holds secret variables that belong to an environment. The values of secret global variables are saved in `environments.json` in plain text. Keep credentials in an environment instead.
:::

### Warning for unmarked secrets

When you click **Save**, Nouto checks for variables that look like credentials but aren't marked as secret. A variable looks like a credential when:

- Its name contains `key`, `secret`, `token`, `password`, `passwd`, `auth`, or `credential`, in any case.
- Its value is longer than 20 characters and starts with a known token prefix, such as `sk-`, `ghp_`, `AKIA`, `xoxb-`, or `glpat-`.

If any variables match, the **Possible secrets detected** dialog lists them. Click **Go Back** to mark them as secret, or **Save Anyway** to save them in plain text.

## Share variables with your team

Environments are local to each machine, so you choose how teammates get the same variables. Committing a `.env.example` file works best for teams that share a repository. Exporting environments works for sharing a one-off set of variables.

### Commit a .env.example file

A `.env.example` file lists every variable your requests need, with placeholder values. Each developer keeps the real values in a `.env` file that Git ignores.

1. Create `.env.example` in your project root with every variable name and a safe placeholder value:

   ```dotenv title=".env.example"
   # API configuration
   BASE_URL=https://api.example.com
   API_VERSION=v2

   # Fill in your own values in .env, never in this file
   API_KEY=your_api_key_here
   ACCESS_TOKEN=your_token_here
   ```

2. Add `.env` to your `.gitignore`, and commit `.env.example`.
3. Ask each developer to copy `.env.example` to `.env` and fill in their own values.
4. Ask each developer to [link their `.env` file](/variables/env-file) in Nouto.

Nouto reads a linked `.env` file into memory and doesn't copy its values into its own storage. Nouto doesn't mask `.env` values, so the file itself must stay out of version control.

### Export and import environments

1. In the Environments panel, click **Export** on an environment, or **Export all environments** in the list header.
2. Send the exported JSON file to your teammates.
3. Each teammate clicks **Import environments** in the Environments panel and selects the file.

What the exported file contains depends on the platform:

- The VS Code extension leaves secret values empty in the exported file. Recipients fill them in. The extension doesn't keep the secret flag when it imports a file, so mark those variables as secret again before you enter the values.
- The desktop app writes secret values into the exported file in plain text.

:::caution
Before you share or commit a file exported from the desktop app, open it and remove the secret values.
:::

## Storage summary

This table shows where each kind of data lives:

| Data | VS Code extension | Desktop app |
|------|-------------------|-------------|
| Environments | `environments.json` in VS Code global storage | `environments.json` in the app data folder, or `.nouto/environments.json` in the open workspace folder |
| Global variables | `environments.json` in VS Code global storage | `environments.json` in the app data folder |
| Secret values in environments | VS Code secret storage | Operating system keychain |
| Secret values in global variables | VS Code secret storage | `environments.json` in the app data folder |
| Linked `.env` file values | Memory only | Memory only |
| Linked `.env` file path | `environments.json` in VS Code global storage | Not saved |
| Exported environment files | Where you save them, with secret values empty | Where you save them, with secret values included |
