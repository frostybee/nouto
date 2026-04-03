---
title: Building Requests
description: Build HTTP requests in Nouto using the request editor, including URL, method, headers, params, body, auth, and settings.
---

The request editor is the central workspace in Nouto. It contains everything you need to configure and send an HTTP request: a URL bar with method selector, and a tabbed panel for params, headers, body, auth, and per-request settings.

<!-- screenshot: building-requests/request-editor-overview.png -->
![Full request editor showing the URL bar with method selector, Send button, and the tab row (Params, Headers, Body, Auth, Settings)](/screenshots/building-requests/request-editor-overview.png)

## URL Bar

Type or paste a URL into the URL bar. Nouto auto-corrects URLs missing the `https://` prefix and highlights path parameters like `:id` or `:userId` directly in the bar.

The method selector is on the left. Supported methods: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS`.

Click **Send** to execute the request. While a request is in-flight, the Send button becomes a **Cancel** button.

## Request Tabs

| Tab | Purpose |
|-----|---------|
| [Params](/building-requests/params) | Query parameters and path parameter values |
| [Headers](/building-requests/headers) | Request headers with autocomplete |
| [Body](/building-requests/body-types) | Request body in one of 8 formats |
| Auth | Authentication credentials (see [Authentication](/authentication)) |
| [Settings](/building-requests/timeouts-redirects) | Timeout, redirects, [SSL](/building-requests/ssl-certificates), [proxy](/building-requests/proxy) |

Each tab shows a badge when it has active (non-empty, enabled) entries.

## Request Notes

Every request has a **Notes** field for free-form Markdown documentation. Use it to record what an endpoint does, what parameters are required, or example responses. Notes are saved as part of the request in your collection.

## Saving Requests

Press `Ctrl+S` (`Cmd+S` on Mac) to save the current request to your collection. Unsaved changes appear as a dot indicator on the request name in the sidebar.

## Cancelling a Request

Click **Cancel** or press `Escape` while a request is in-flight to abort it. The response panel shows a cancellation message.
