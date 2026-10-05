---
title: Query and path parameters
description: Add query string parameters and path parameter values to a request in Nouto with the Query and Path tabs.
sidebar:
  order: 1
---

Use the **Query** tab for parameters after the `?` in the URL. Use the **Path** tab for values that replace placeholders such as `:id` in the URL path.

## Query parameters

The **Query** tab and the URL bar stay in sync. When you type a query string into the URL bar, for example `?page=2&limit=10`, each parameter becomes a row on the **Query** tab. When you edit a row, the URL bar updates.

To add a parameter from the tab:

1. Open the **Query** tab.
2. Select **Add Item**. If the tab already has rows, select **Add** below them.
3. Enter the parameter name and value. Press `Enter` in the last row to start another row.

Each row has a checkbox, a name, a value, and a description. Clear the checkbox to leave a parameter out of the request without deleting the row; disabled rows don't appear in the URL bar. The description is for your own notes and isn't sent.

The **Query** tab is hidden when the body type is GraphQL.

## Path parameters

A path parameter is a placeholder in the URL path. Nouto recognizes two forms:

- `:name`, for example `https://api.example.com/users/:userId`
- `{name}`, for example `https://api.example.com/users/{userId}`

Double braces, as in `{{userId}}`, mark a variable, not a path parameter. A colon in the host part of the URL, such as the port in `localhost:8080`, isn't treated as a placeholder.

When you type or paste a URL with placeholders into the URL bar, Nouto adds a row for each one to the **Path** tab. Enter a value in each row. Before sending, Nouto replaces each placeholder with its value.

For example, with the URL `https://api.example.com/users/:userId/posts/:postId` and these values:

| Key | Value |
|-----|-------|
| `userId` | `42` |
| `postId` | `7` |

Nouto sends the request to `https://api.example.com/users/42/posts/7`.

A placeholder whose row is disabled or has an empty value stays in the URL as typed.

## Variables in parameters

Query parameter names and values, and path parameter values, accept `{{variable}}` syntax. Typing `{{` in a value field lists the available variables.

```text
page={{PAGE_NUMBER}}
userId={{CURRENT_USER_ID}}
```

## Requests imported from Postman

When you import a Postman collection, query parameters keep their enabled or disabled state. Postman path variables such as `:id` stay in the URL, but their values aren't imported. Enter the values on the **Path** tab. If the tab is empty, edit the URL once so that Nouto detects the placeholders. See [Import from Postman](/import-export/from-postman).
