---
title: Secrets & Sensitive Data
description: How Nouto stores environment variables, how to protect sensitive values, and how to share configurations with your team safely.
sidebar:
  order: 4
---

## How Nouto Stores Environments

### VS Code Extension

Environments and global variables are stored in **VS Code's global extension storage**, not inside your workspace or project directory. This means:

- They never appear in your file system alongside your code
- They are never committed to git accidentally
- Each machine keeps its own copy

When you switch to [workspace storage mode](/settings/storage), only your **collections** move into the `.nouto/` workspace folder. Environments remain in global storage on that machine.

### Desktop App

In the Desktop app, environments and global variables are stored in a platform-specific configuration directory (`~/.config/nouto/` on Linux, `~/Library/Application Support/nouto/` on macOS, and `%APPDATA%\nouto\` on Windows). Like the VS Code extension, these files live outside any project directory and are not committed to git.

This is intentional. Environments often contain API keys, tokens, and passwords. Keeping them out of the workspace directory prevents them from ending up in version control.

## Secret Variables

Any variable can be marked as **secret**. Secret variables:

- Show as `••••••••` in the UI
- Are encrypted before being written to disk
- Have their values stripped when you export an environment to JSON

Mark a variable as secret by clicking **Mark as secret** next to its value row in the environment editor. To unmask it temporarily for editing, use the reveal button.

### Desktop App: OS Keychain

In the Desktop app, secret variable values are stored in the **operating system keychain** rather than on disk:

- **Windows**: Windows Credential Manager
- **macOS**: macOS Keychain
- **Linux**: libsecret (GNOME Keyring or compatible)

This means secret values never touch the file system — they are read directly from the OS keychain at runtime. Non-secret variable values are stored in the app's config directory as described above.

Use secrets for:

- API keys and access tokens
- Passwords and credentials
- Private keys and signing secrets
- Any value you would not want visible on your screen during a screen share

## Sharing Configurations with Your Team

Because environments are local to each machine, you have two options for sharing variable configurations:

### Option 1: Export and import environment JSON

1. In the **Environments** tab, click the export button next to an environment
2. Share the exported `.json` file with your team (via Slack, email, or a shared drive)
3. Each team member imports it using the import button in the Environments toolbar

Secret variable values are stripped from the export. Recipients receive the variable names and non-secret values, and must fill in secret values themselves.

### Option 2: Commit a `.env.example` to your repository (recommended)

This is the most common pattern for development teams:

1. Create a `.env.example` file in your project root with all variable names and safe placeholder values:

```env
# API configuration
BASE_URL=https://api.example.com
API_VERSION=v2

# Authentication — fill in your own values, never commit real tokens
API_KEY=your_api_key_here
ACCESS_TOKEN=your_token_here

# Database
DB_HOST=localhost
DB_PORT=5432
```

2. Commit `.env.example` to your repository
3. Each developer copies it to `.env` and fills in their real values
4. Add `.env` to `.gitignore` so the real values are never committed
5. Each developer links their local `.env` file in Nouto

When a new team member clones the repository, they:

1. Copy `.env.example` to `.env`
2. Fill in their credentials
3. In Nouto, open the **Environments** tab and click **Link .env file**
4. All variables are immediately available in requests

### What not to do

Do not export environment JSON files that contain real secret values and commit them to a repository. Even if the values are not flagged as secret in Nouto, anyone with access to the repository can read them.

## `.env` Files and Sensitive Data

Linking a `.env` file gives Nouto read access to its contents for the current session. Nouto does not copy the file's contents into its own storage. The variables exist only in memory and reload each time the file changes.

This means:

- The `.env` file itself is the source of truth
- Nouto never stores `.env` values to disk (only the path to the file is saved)
- If the file is deleted or moved, the variables disappear immediately

Keep your `.env` file out of version control by ensuring it is listed in `.gitignore`.

## Summary

| Data | VS Code | Desktop | In git? |
|------|---------|---------|---------|
| Environments | VS Code global storage | App config directory | No |
| Global variables | VS Code global storage | App config directory | No |
| Secret variable values | Encrypted in VS Code global storage | OS keychain (never on disk) | No |
| Exported environment JSON | Wherever you save it | Wherever you save it | Only if you commit it |
| Linked `.env` file contents | Memory only (not persisted) | Memory only (not persisted) | Only if you commit the file |
| Linked `.env` file path | VS Code global storage | App config directory | No |
