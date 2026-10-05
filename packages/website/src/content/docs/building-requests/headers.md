---
title: Headers
description: Add request headers in Nouto with name and value suggestions, bulk editing, and headers inherited from collections and folders.
sidebar:
  order: 2
---

Add request headers on the **Headers** tab. The tab also shows the headers that the request inherits from its collection or folder, and the `Content-Type` that Nouto sets from the body type.

## Add a header

1. Open the **Headers** tab.
2. Select **Add Item**. If the tab already has rows, select **Add** below them.
3. Type the header name. A list of matching standard and common headers appears; hover a suggestion to see what the header does.
4. Enter the value. For headers with well-known values, such as `Content-Type`, `Accept`, and `Cache-Control`, the value field suggests them.

Press `Enter` in the last row to start another row. Clear a row's checkbox to stop sending that header without deleting it.

## Edit headers as text

Select **Bulk Edit** (or the edit icon above the rows) to edit all headers as text, one per line in `Name: Value` form. Prefix a line with `#` to disable that header. Select **Table** to return to the rows.

```text
Accept: application/json
X-Request-ID: {{$uuid.v4}}
# X-Debug: true
```

## Variables in headers

Header names and values accept `{{variable}}` syntax. Typing `{{` in a value field lists the available variables.

```text
Authorization: {{AUTH_HEADER}}
X-Tenant-ID: {{TENANT_ID}}
X-Timestamp: {{$timestamp.unix}}
```

## Headers Nouto adds

Nouto adds these headers when you don't set them yourself:

| Header | Value |
|--------|-------|
| `Content-Type` | Set from the body type. The Headers tab shows it as an **AUTO** row. See [Body types](/building-requests/body-types). |
| `User-Agent` | `Nouto` |
| `Authorization` | Set from the **Auth** tab. See [Authentication](/authentication). |

To send a different `Content-Type` or `User-Agent`, add that header on the tab, and Nouto sends your value instead. When you add `Content-Type`, the **AUTO** row disappears.

When the **Auth** tab is configured, set credentials there rather than adding an `Authorization` header by hand.

## Inherited headers

Headers set on a collection or folder are sent with every request inside it. They appear under **Inherited Headers** at the top of the **Headers** tab. If a request header has the same name as an inherited one, compared without regard to case, the request header wins.

To set headers on a collection or folder, right-click it in the sidebar, select **Settings...**, and open the **Headers** tab. See [Collections](/features/collections).
