---
title: Environments & Variables
description: Create named environments in Nouto to switch between dev, staging, and production configurations without editing your requests.
sidebar:
  order: 0
---

Environments let you define a named set of variables and switch between them with a single click. When you change the active environment, every `{{variable}}` reference in your requests resolves to the new environment's values automatically.

## Creating an Environment

1. Open the **Variables** tab in the Nouto sidebar.
2. Click **Add Environment** and enter a name (e.g., "Local", "Staging", "Production").
3. Add key-value pairs to the environment.

A typical multi-environment setup:

| Key | Local | Staging | Production |
|-----|-------|---------|------------|
| `baseUrl` | `http://localhost:3000` | `https://staging-api.example.com` | `https://api.example.com` |
| `apiKey` | `dev-key` | `sk-stg-xyz` | `sk-prod-abc` |
| `timeout` | `30000` | `15000` | `10000` |

## Switching Environments

Click an environment name in the sidebar to make it active. Only one environment is active at a time. The environment selector in the URL bar area also shows the current active environment.

All `{{variable}}` references resolve to the active environment's values when you click **Send**.

## Using Variables in Requests

Use `{{variableName}}` anywhere in a request:

```
GET {{baseUrl}}/users/{{userId}}
Authorization: Bearer {{apiKey}}
```

Variables work in URLs, query parameters, headers, body fields, and authentication fields.

## Toggling Variables

Each variable row has an **enabled** checkbox. Disabled variables are not included in resolution, even if the key exists. Use this to temporarily exclude a variable without deleting it.

## Global Variables

Global variables are always active, regardless of which environment is selected. Add them in the **Global Variables** section of the Variables tab.

Use global variables for values shared across all environments:

- Team credentials used everywhere
- Feature flags that apply across dev and staging
- Shared base paths

When the same key exists in both the active environment and global variables, the active environment wins.

## Secret Variables

Variables marked as **secret** are encrypted before being stored. Their values are masked in the UI and never written to disk in plain text. Use secrets for tokens, passwords, and API keys.

For guidance on protecting sensitive data and sharing configurations with your team, see [Secrets & Sensitive Data](/variables/secrets).

## Variable Priority

When the same variable name appears in multiple sources, the highest-priority source wins:

| Priority | Source |
|----------|--------|
| Highest | Active environment |
| | Global variables |
| Lowest | Linked `.env` file |

Scripts (`nt.setVar()`) write into the active environment scope and follow the same priority order.

## Collection and Folder Variables

Collections and folders can also define variables that override the environment for requests within them. See [Collections](/features/collections) for details.

## Autocomplete

Typing `{{` anywhere in a request field opens a dropdown of available variable names from the active environment, global variables, and `.env` file. Selecting one inserts it with the closing `}}`.
