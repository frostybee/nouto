---
title: Cookie Jars
description: Manage cookies across requests with named cookie jars, auto-injection, and Set-Cookie parsing in Nouto.
sidebar:
  order: 1
---

Nouto provides a cookie management system with named jars, automatic domain-based injection, and `Set-Cookie` header parsing. Use it to test authenticated sessions, multi-tenant applications, or any API that relies on cookies.

<!-- screenshot: tools/cookie-jar-panel.png -->
![Cookie jar panel showing the jar selector dropdown, a list of cookies with name, value, domain, and path columns, and the response cookies tab showing sent vs received cookies](/screenshots/tools/cookie-jar-panel.png)

## Cookie Jars

A cookie jar is a named container that holds cookies. You can create multiple jars to keep cookies separated between environments, users, or test scenarios.

### Creating a Jar

Open the cookie management panel and click **Add Jar**. Give it a name (e.g., "Admin Session", "Guest User", "Staging").

### Selecting a Jar

The active jar selector appears in the URL bar area. Choose which jar is active for the current request. Cookies from the active jar are injected into requests and new cookies from responses are stored in it.

## Cookie Attributes

Each cookie has the standard HTTP cookie attributes:

| Attribute | Description |
|-----------|-------------|
| **Name** | Cookie name |
| **Value** | Cookie value |
| **Domain** | Domain the cookie applies to |
| **Path** | URL path the cookie applies to |
| **Expires** | Expiration date/time |
| **HttpOnly** | Whether the cookie is inaccessible to JavaScript |
| **Secure** | Whether the cookie is sent only over HTTPS |
| **SameSite** | Cross-site request policy (`Strict`, `Lax`, `None`) |

## Auto-Injection

When you send a request, Nouto checks the active cookie jar for cookies that match the request URL by domain and path. Matching cookies are added to the `Cookie` header automatically.

This works for HTTP, WebSocket, and SSE requests.

## Set-Cookie Parsing

When a response includes `Set-Cookie` headers, Nouto parses them and stores the cookies in the active jar. Subsequent requests to the same domain will include the new cookies. This lets you test login flows where the server sets a session cookie.

## Response Cookies Tab

The **Cookies** tab in the response panel shows two sections:

- **Sent**: cookies that were included in the request (from the active jar)
- **Received**: cookies parsed from `Set-Cookie` response headers

This makes it easy to see exactly which cookies were exchanged during a request.

## Manual Cookie Management

You can add, edit, and delete cookies directly in the jar panel. This is useful for testing specific cookie values without going through a login flow.

## Cookie Variables

Reference a cookie value in any request field using the `{{$cookie.name}}` syntax:

```
X-CSRF-Token: {{$cookie.csrfToken}}
```

The cookie is looked up in the active jar, matched by domain and path against the request URL.

## Script API

Scripts can read and write cookies programmatically. See [Cookie Script API](/tools/cookie-script-api) for the full reference.

## Backup

Cookie jars are included in Nouto's backup and restore feature. The `.nouto-backup` file covers cookies alongside collections, environments, and other data.
