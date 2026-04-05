---
title: Timeouts & Redirects
description: Configure per-request timeout, redirect following, and maximum redirect count in Nouto.
sidebar:
  order: 6
---

The **Settings** tab in the request editor lets you control how long Nouto waits for a response and how it handles HTTP redirects. Both settings are per-request and saved as part of the collection.

<!-- screenshot: building-requests/timeout-redirects.png -->
![Settings tab showing the timeout input field and the Follow redirects toggle with Max redirects input](/screenshots/building-requests/timeout-redirects.png)

## Request Timeout

The timeout determines how long Nouto waits for the server to respond before giving up.

1. Open the request and go to the **Settings** tab.
2. Find the **Timeout** field.
3. Enter a value in milliseconds.

| Value | Behavior |
|-------|----------|
| Empty (default) | 30-second timeout |
| `0` | No timeout — waits indefinitely |
| `5000` | 5-second timeout |
| `60000` | 1-minute timeout |
| `600000` | 10-minute timeout (maximum) |

If the server does not respond within the configured timeout, the request fails with a timeout error.

### When to Adjust the Timeout

**Increase it** for:
- Endpoints that process large datasets or run expensive queries
- File uploads where the upload itself takes time
- Long-polling endpoints

**Decrease it** for:
- Health checks where a slow response means the service is down
- Any test where you want to detect unresponsive services quickly

**Set to `0`** for:
- Streaming endpoints where you want to wait indefinitely
- Long-polling connections

## Follow Redirects

By default, Nouto follows HTTP 3xx redirects automatically. You can disable this or limit the number of consecutive redirects.

1. Open the request and go to the **Settings** tab.
2. Toggle **Follow redirects** on or off.
3. When enabled, optionally set **Max redirects** (default: 10).

| Setting | Default | Description |
|---------|---------|-------------|
| Follow redirects | On | Automatically follow 301, 302, 303, 307, 308 responses |
| Max redirects | 10 | Stop after this many redirects |

### Redirect Method Behavior

| Status | Method handling |
|--------|----------------|
| 301 Moved Permanently | POST/PUT changes to GET |
| 302 Found | POST/PUT changes to GET |
| 303 See Other | Always uses GET |
| 307 Temporary Redirect | Original method preserved |
| 308 Permanent Redirect | Original method preserved |

### When to Disable Redirects

**Debugging redirect chains**: See the raw 3xx response, including the `Location` header, without following it. Use the [redirect chain viewer](/response/response-viewer) in the response panel to inspect each hop in a chain.

**OAuth callbacks**: Inspect the redirect URL containing the authorization code before the browser follows it.

**API testing**: Verify that your API returns the correct status code and Location header for redirect scenarios.

**Security testing**: Check for open redirect vulnerabilities by seeing exactly where a redirect points.

## Storing These Settings

Timeout and redirect settings are stored per-request in your collection:

```json
{
  "timeout": 60000,
  "followRedirects": false,
  "maxRedirects": 5
}
```

When these fields are absent, the defaults apply: 30-second timeout, redirects enabled, max 10 redirects.

## Platform Support

| Setting | VS Code extension | Desktop app |
|---------|-----------------|-------------|
| Timeout | Supported | Supported |
| Follow redirects | Supported | Supported |
| Max redirects | Supported | Supported |
