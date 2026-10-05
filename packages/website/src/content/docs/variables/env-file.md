---
title: Link a .env file
description: Load variables from your project's .env file into Nouto, keep them in sync when the file changes, and learn which .env syntax Nouto supports.
sidebar:
  order: 3
---

Link a `.env` file to use the variables your application already reads, without copying them into a Nouto environment. Nouto reads the file into memory, reloads it when you save it, and never writes to it.

## Link the file

1. Open the Environments panel. In VS Code, click **Environments** in the toolbar at the top of the Nouto sidebar. In the desktop app, click **Environments** in the left rail.
2. Select **Environments**.
3. In the **.env File** section above the environment list, click **Link .env file**.
4. Select your `.env` file.

The section then shows the file name, the number of variables Nouto read from it, and **Linked**.

In the desktop app, the file picker shows only files whose names end in `.env`, such as `.env` or `local.env`. To pick a file named differently, such as `.env.local`, use the VS Code extension, whose picker also offers **All Files**.

## Use the variables

Reference a `.env` variable like any other variable. The variables are available whichever environment is active:

```http
GET {{API_URL}}/users/{{USER_ID}}
Authorization: Bearer {{API_KEY}}
```

The linked file has the lowest priority. If the active environment, the request's collection or folder, or the global variables define the same name, their value wins. For example, keep `API_URL=http://localhost:3000` in `.env` and define `API_URL` as `https://api.example.com` in a `Production` environment. Activating `Production` then switches the URL without editing the file. See [Resolution order](/variables/variable-substitution#resolution-order).

## Supported syntax

Nouto reads the file one line at a time. This example shows the syntax it understands:

```dotenv title=".env"
# Comment lines are ignored
DB_HOST=localhost
DB_PORT=5432

# Text after " #" is a comment in unquoted values
TIMEOUT=30 # seconds

# Quotes are removed from quoted values
API_KEY="sk-abc123"
GREETING='Hello, world'
```

Each line is read according to these rules:

| Line | Result |
|------|--------|
| `KEY=value` | Variable `KEY` with the value `value`. Spaces around the key and the value are removed. |
| Starts with `#` | Comment. Nouto ignores the line. |
| Empty, or without `=` | Ignored |
| `KEY=value # note` | In an unquoted value, everything from a space followed by `#` is removed. `URL=http://host/#top` keeps `#top`, because no space precedes the `#`. |
| `KEY="value"` | The double quotes are removed. The VS Code extension turns `\n`, `\t`, `\"`, and `\\` into a newline, a tab, a quote, and a backslash. The desktop app keeps them as written. |
| `KEY='value'` | The single quotes are removed. Nothing inside is escaped. |

Keep these limits in mind when you write the file:

- Start variable names with a letter or underscore, and use only letters, digits, and underscores.
- Keep each value on one line. Nouto doesn't read values that span several lines.
- Don't write `export` before a variable. Nouto doesn't make variables declared that way available.
- Don't put a comment after a quoted value. Nouto then keeps the quotes as part of the value.

## Reload after changes

Nouto watches the linked file. When you save it in any editor, Nouto reads it again, so the next request uses the new values. You don't need to link it again.

If you delete the file, the VS Code extension clears its variables and reads them again if the file comes back. The desktop app keeps the values it read last.

## Unlink the file

In the **.env File** section, click **Unlink**. Nouto removes the file's variables. Your environments and global variables don't change.

## After a restart

In the desktop app, the link lasts until you close the app. In VS Code, Nouto saves the file path and links the file again at startup if it still exists.

If the **.env File** section shows **Link .env file** after a restart, link the file again.

## Values aren't masked

Nouto shows `.env` values in plain text, for example in autocomplete. Keep the file out of version control. For a pattern to share variable names with your team without sharing values, see [Secrets and sensitive data](/variables/secrets).
