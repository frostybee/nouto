---
title: .env File Linking
description: Link a .env file from your project to Nouto so its variables are available in all request fields automatically.
sidebar:
  order: 3
---

Nouto can link a `.env` file from your project directory and load its variables alongside your environment variables. The file is watched for changes and reloads automatically whenever you save it.

<!-- screenshot: variables/env-file-link.png -->
![Variables tab with a linked .env file showing the file name, variable count, and Unlink button; and the Link .env File button when no file is linked](/screenshots/variables/env-file-link.png)

## Linking a .env File

1. Open the **Variables** tab in the Nouto sidebar.
2. In the **.env File** section, click **Link .env File**.
3. Select your `.env` file from the file picker.
4. The file's variables appear immediately in the panel.

## Unlinking

Click **Unlink** next to the file name. All variables from the file are removed immediately. Your environments and global variables are unaffected.

## Supported Format

Nouto parses standard `.env` file syntax:

```env
# Comments are ignored
DB_HOST=localhost
DB_PORT=5432
DB_NAME=myapp

# Quoted values
API_KEY="sk-abc123"
DESCRIPTION='A literal string with no escapes'

# Double-quoted values support escape sequences
MULTILINE="Line one\nLine two"

# Inline comments (unquoted values only)
TIMEOUT=30 # seconds

# Variable with underscores and numbers
RETRY_COUNT_MAX=3
```

### Parsing Rules

| Feature | Behavior |
|---------|----------|
| `#` comment lines | Ignored entirely |
| Empty lines | Skipped |
| Unquoted values | Trimmed; trailing `# comment` stripped |
| Double-quoted values | Supports `\n`, `\t`, `\"`, `\\` escape sequences |
| Single-quoted values | Literal strings, no escape processing |
| Key format | Must start with a letter or underscore, followed by letters, digits, or underscores |

## Auto-Reload

Nouto watches the linked file for changes. When you edit and save it in any editor, the variables update within seconds — no need to re-link or restart. If the file is deleted, its variables are cleared. If it reappears, the variables reload automatically.

## Priority

`.env` file variables have the lowest priority in Nouto's resolution chain. When the same key exists in multiple sources, the active environment or global variables take precedence:

| Priority | Source |
|----------|--------|
| Highest | Active environment |
| | Global variables |
| Lowest | Linked `.env` file |

This means you can define a default value in `.env` (e.g., `API_URL=http://localhost:3000`) and override it in a specific environment (e.g., Production: `API_URL=https://api.example.com`) without touching the file.

## Using .env Variables

Use `.env` variables the same way as any other variable:

```
GET {{API_URL}}/users/{{USER_ID}}
Authorization: Bearer {{API_KEY}}
```

## Persistence

The linked file path is saved as part of your Nouto workspace configuration. When you reopen the workspace, the file is re-linked automatically.

## Common Use Case

Link the `.env` file already present in your project root. This gives Nouto access to the same configuration your application reads, so you can test against the same endpoints without duplicating variables.

```env
# Your project's .env
DATABASE_URL=postgres://localhost/mydb
REDIS_URL=redis://localhost:6379
AUTH_SERVICE_URL=http://localhost:4000
JWT_SECRET=dev-secret-not-for-prod
```

Nouto picks up all of these. Switch to a different environment for production values without editing this file.
