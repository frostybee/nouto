---
title: Environments & Variables
description: Define variables per environment and switch between dev, staging, and production without editing your requests.
---

Environments let you store a named set of variables and activate them with a single click. All `{{variable}}` references in your requests resolve to the active environment's values at send time. Switching from "Local" to "Staging" instantly changes every URL, token, and config value across all your requests.

## Creating an Environment

1. Open the **Variables** tab in the Nouto sidebar.
2. Click **Add Environment** and enter a name (e.g., "Local", "Staging", "Production").
3. Add key-value pairs.

A typical setup:

| Key | Local | Staging | Production |
|-----|-------|---------|------------|
| `baseUrl` | `http://localhost:3000` | `https://staging-api.example.com` | `https://api.example.com` |
| `apiKey` | `dev-key` | `sk-stg-xyz` | `sk-prod-abc` |

## Switching Environments

Click an environment name in the sidebar to activate it. Only one environment is active at a time. The active environment name appears in the URL bar area.

## Using Variables

Use `{{variableName}}` in any request field: URL, query params, headers, body, auth credentials.

```
GET {{baseUrl}}/users/{{userId}}
Authorization: Bearer {{apiKey}}
```

Typing `{{` opens an autocomplete dropdown listing all available variable names.

## Global Variables

Global variables are always active, regardless of which environment is selected. Use them for values shared across all environments: shared base paths, feature flags, team-wide credentials.

When the same key exists in both the active environment and global variables, the active environment wins.

## Secret Variables

Variables marked as **secret** are encrypted at rest. Their values are masked in the UI and never written to disk in plain text. Use secrets for tokens, passwords, and API keys.

## Dynamic Variables

Nouto generates values on the fly for common patterns:

| Variable | Description |
|----------|-------------|
| `{{$uuid.v4}}` | Random UUID v4 |
| `{{$timestamp.unix}}` | Current Unix timestamp (seconds) |
| `{{$timestamp.iso}}` | Current ISO 8601 timestamp |
| `{{$random.int, 1, 100}}` | Random integer in a range |

For the full list, see [Dynamic Variables](/variables/dynamic-variables).

## Linking a .env File

Link a `.env` file from your project to load its values as a read-only variable source. Values in the active environment override `.env` values when the same key appears in both. See [.env File](/variables/env-file).

## Full Reference

For all variable types, resolution priority, response chaining, and script-set variables, see [Variable Substitution](/variables/variable-substitution).
