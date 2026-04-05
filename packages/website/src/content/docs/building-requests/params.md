---
title: Query Params & Path Params
description: Add query parameters and path parameter values to your requests in Nouto using the Params tab.
sidebar:
  order: 1
---

The **Params** tab handles two kinds of URL parameters: query string parameters added after `?`, and path parameter values for URL segments like `:id` or `:userId`.

<!-- screenshot: building-requests/params-tab.png -->
![Params tab showing query parameter rows with keys and values, and the URL bar reflecting the serialized query string](/screenshots/building-requests/params-tab.png)

## Query Parameters

Query parameters appear in the URL as `?key=value&key2=value2`. The Params tab gives you a structured editor for adding them without editing the URL string directly.

### Adding Parameters

Click **Add Param** to add a new row. Each row has:

- **Key**: the parameter name
- **Value**: the parameter value
- **Enabled checkbox**: uncheck to temporarily exclude a parameter

The URL bar updates in real time as you type. Enabled parameters appear in the URL; disabled ones are hidden.

### Syncing with the URL Bar

The Params tab and URL bar stay in sync. If you type a query string directly into the URL bar (e.g., `?page=2&limit=10`), the Params tab parses it and shows each parameter as a separate row. If you edit a row in the Params tab, the URL bar updates to reflect the change.

### Disabling Parameters

Unchecking a row removes that parameter from the URL without deleting the row. This is useful when testing how an endpoint behaves with different combinations of optional parameters.

## Path Parameters

Path parameters are named segments in the URL that vary per request, like `:id` in `https://api.example.com/users/:id/posts`.

Nouto detects `:name` segments in the URL automatically and shows them as a separate **Path Params** section below the query parameters. Enter the value for each detected segment, and Nouto substitutes it in the URL before sending.

<!-- screenshot: building-requests/path-params.png -->
![URL bar with :id highlighted, and the path params section below showing the id field with a value entered](/screenshots/building-requests/path-params.png)

For example, with URL `https://api.example.com/users/:userId/posts/:postId`:

| Key | Value |
|-----|-------|
| `userId` | `42` |
| `postId` | `7` |

The actual request goes to `https://api.example.com/users/42/posts/7`.

## Variable Support

Both query parameter values and path parameter values accept `{{variable}}` syntax:

```
page={{PAGE_NUMBER}}
userId={{CURRENT_USER_ID}}
```

## Postman Compatibility

Postman query parameters and path variable definitions are preserved during import. Disabled parameters in Postman collections are imported as disabled rows in the Params tab.
