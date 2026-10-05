---
title: Environments and global variables
description: Create environments in Nouto to switch between local, staging, and production values without editing your requests, and define global variables that apply everywhere.
sidebar:
  order: 0
---

An environment is a named set of variables, such as `Local`, `Staging`, or `Production`. When you activate an environment, every `{{variable}}` in your requests resolves to that environment's values, so you can point the same requests at a different server without editing them. Global variables hold values that apply no matter which environment is active.

## Open the Environments panel

You manage environments and global variables in the Environments panel:

- In VS Code, click **Environments** in the toolbar at the top of the Nouto sidebar, or run **Nouto: Environments** from the Command Palette.
- In the desktop app, click **Environments** in the left rail.

The panel has three sections: **Global Variables**, **Environments**, and **Cookie Jar**. For cookie jars, see [Cookie jars](/tools/cookie-jars).

## Create an environment

1. In the Environments panel, select **Environments**.
2. Click **New environment** (the `+` icon). Nouto adds an environment named `New Environment` and opens it in the editor.
3. Enter a name in the **Name** field. To tell environments apart at a glance, pick a **Color**.
4. Add a row for each variable, with a name and a value.
5. Click **Save**.

Nouto also saves your changes when you select another environment in the list.

A typical setup defines the same variable names in each environment, with different values:

| Variable | Local | Staging | Production |
|----------|-------|---------|------------|
| `baseUrl` | `http://localhost:3000` | `https://staging.example.com` | `https://api.example.com` |
| `apiKey` | `dev-key` | `stg-key-123` | `prod-key-456` |

Use letters, digits, and underscores in variable names. The editor accepts dots and hyphens, but Nouto doesn't substitute names that contain them. See [Variable names](/variables/variable-substitution#variable-names).

Each environment in the list also has buttons to **Duplicate**, **Export**, and **Delete** it.

## Activate an environment

Only one environment is active at a time. To activate one, use any of these controls:

- In the Environments panel, click **Set active** (the circle icon) next to the environment. Click it again to deactivate the environment.
- In VS Code, click **More actions** (`...`) next to **Send** in the request editor, and select the environment under **Environment**.
- In the desktop app, select the environment from the environment dropdown in the top toolbar.

The active environment has a check mark in the Environments panel. To send requests without an environment, select **No Environment**.

In VS Code, hover **Environments** in the sidebar toolbar to see the name of the active environment. A dot on the icon means you have environments but none of them is active.

## Use variables in a request

Reference a variable by name inside double braces in the URL, query parameters, headers, body, or auth fields:

```http
GET {{baseUrl}}/users/42
Authorization: Bearer {{apiKey}}
```

Type `{{` in the URL bar, a key-value table, or the body editor to see the available variables. Autocomplete lists variables from the active environment, the current collection and folder, global variables, and the linked `.env` file. Secret values show as `******`.

For the complete list of fields and the placeholders for responses and cookies, see [Variable substitution](/variables/variable-substitution).

## Check how variables resolve

When the URL contains a placeholder, an icon after the URL shows whether Nouto can fill it in:

| Icon | Meaning |
|------|---------|
| Green check | Every variable in the URL has a value. |
| Orange warning | At least one variable has no value in the active environment, collection or folder variables, global variables, or `.env` file. |
| Blue lightning bolt | The URL uses dynamic, response, or cookie placeholders, such as `{{$uuid.v4}}` or `{{Login.$response.body.id}}`, and every other variable has a value. |

Hover the icon to list the placeholders by status, for example `Resolved: baseUrl | Unresolved: apiKey`. The tooltip shows names, not values.

To see the values, click **Copy resolved URL** (the copy icon at the end of the URL bar) and paste the result. Nouto copies the URL with its query parameters and replaces each placeholder that has a value. Dynamic placeholders generate a new value on every substitution, so the copied value can differ from the one Nouto sends.

## Disable a variable

Each variable row has a checkbox. Clear it to stop Nouto from using the variable without deleting it. Nouto treats a disabled variable as if it weren't defined.

## Global variables

Global variables apply to every request, whichever environment is active. Use them for values that are the same everywhere, such as an API version or a tenant ID.

1. In the Environments panel, select **Global Variables**.
2. Add a row for each variable.
3. Click **Save**.

If the active environment defines a variable with the same name, the environment's value wins. When you edit an environment, the **Also active** bar above its variables lists the global variables, and marks the ones that the environment overrides with **env wins**.

## Which value wins

Nouto looks up each name in this order and uses the first match: the active environment, the request's folder and collection variables, global variables, then the linked `.env` file. See [Resolution order](/variables/variable-substitution#resolution-order).

Collections and folders can define their own variables. They apply only to requests saved in that collection. See [Collections](/features/collections).

To load variables from a `.env` file in your project, see [Link a .env file](/variables/env-file).

## Secret variables

Click the lock icon on a variable row to mark it as secret. Nouto hides the value in the editor and keeps it out of the environments file. To protect values you share with your team, see [Secrets and sensitive data](/variables/secrets).

## Import and export

The Environments panel can move environments between machines:

- In the **Environments** section, use **Export** on an environment, or **Export all environments** in the list header. Use **Import environments** to load an exported file.
- In the **Global Variables** section, use **Export** and **Import**.

Before you share an exported file, check what it contains. See [Share variables with your team](/variables/secrets#share-variables-with-your-team).
