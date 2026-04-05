---
title: Headers
description: Add and manage request headers in Nouto, with autocomplete for standard HTTP header names and values.
sidebar:
  order: 2
---

The **Headers** tab contains a key-value editor for setting HTTP request headers. Nouto provides autocomplete for standard header names and common values so you can find the right header without looking up documentation.

<!-- screenshot: building-requests/headers-autocomplete.png -->
![Headers tab with autocomplete dropdown showing HTTP header name suggestions and descriptions](/screenshots/building-requests/headers-autocomplete.png)

## Adding Headers

Click **Add Header** or press the shortcut shown at the bottom of the tab to add a new row. Each row has:

- **Key**: the header name (e.g., `Content-Type`, `X-Request-ID`)
- **Value**: the header value
- **Enabled checkbox**: uncheck to temporarily disable a header without removing it

## Autocomplete

When you start typing in the Key field, Nouto shows a dropdown of matching standard HTTP headers with a short description of each. Selecting a suggestion fills in the header name and, for headers with common values (like `Content-Type` or `Accept`), also suggests values.

Recognized headers include request headers from RFC 7231 and common non-standard headers (`Authorization`, `X-Correlation-ID`, `X-Request-ID`, etc.).

## Disabling Headers

The checkbox on each row toggles the header on and off. Disabled headers are not sent with the request but remain in the editor so you can re-enable them later. This is useful for testing which headers are required by an endpoint.

## Variable Support

Both the key and value fields accept `{{variable}}` syntax:

```
Authorization: {{AUTH_HEADER}}
X-Tenant-ID: {{TENANT_ID}}
X-Timestamp: {{$timestamp.unix}}
```

## Automatic Headers

Nouto adds certain headers automatically based on the request configuration:

| Header | When added automatically |
|--------|------------------------|
| `Content-Type` | When the Body tab has a type selected |
| `Authorization` | When the Auth tab has credentials configured |
| `Content-Length` | Calculated from the body size |

You can override any automatic header by adding a manual entry with the same name. Your manually specified value takes precedence.

## Inherited Headers

Collections and folders can define headers that apply to all requests inside them. A request set to inherit from its parent receives those headers without any configuration. You can add request-level headers in addition to the inherited ones.

See [Collections](/features/collections) for instructions on setting collection-level and folder-level headers.
