---
title: Timeouts and redirects
description: Set how long Nouto waits for a response and whether it follows HTTP redirects, for all requests or for a single request.
sidebar:
  order: 6
---

The timeout sets how long Nouto waits for the server before it stops a request. The redirect settings control whether Nouto follows `3xx` responses and how many it follows. Set defaults for all requests in **Settings > Network**, and override them for one request on its **Settings** tab.

## Request timeout

To set the timeout for one request:

1. Open the request and select the **Settings** tab.
2. Under **Timeout**, enter a value in **Request timeout**, in milliseconds.

To change the default for all requests, open Nouto's settings with the gear icon, select **Network**, and enter **Default Request Timeout**.

| Value | Behavior |
|-------|----------|
| Empty | Uses the default from **Settings > Network**, or 30 seconds if that's empty too |
| `0` | No timeout. In the desktop app, `0` sets a limit of 24 hours. |
| `5000` | 5 seconds |
| `600000` | 10 minutes, the largest value Nouto accepts |

If the server doesn't respond in time, the request fails with a timeout error.

Raise the timeout for slow operations such as large uploads, report generation, or long polling. Lower it for health checks, where a slow answer already means the service has a problem.

## Redirects

Nouto follows `3xx` redirects by default. To change this for one request:

1. Open the request and select the **Settings** tab.
2. Under **Redirects**, turn **Follow redirects** on or off.
3. If redirects are on, enter **Max redirects**, from 1 to 100.

To change the default for all requests, use **Follow Redirects** and **Max Redirects** in **Settings > Network**.

| Setting | Default |
|---------|---------|
| Follow redirects | On |
| Max redirects | 10 in the desktop app, 5 in the VS Code extension |

When a response is still a redirect after the maximum number of hops, the VS Code extension shows that last redirect response. The desktop app fails the request with `Maximum number of redirects (N) exceeded`.

After Nouto follows one or more redirects, the response panel shows a **Redirects** tab with each hop. See [Response viewer](/response/response-viewer).

### Method on the redirected request

Some redirect status codes change the method of the next request:

| Status | Method Nouto uses for the next request |
|--------|----------------------------------------|
| `301 Moved Permanently`, `302 Found` | `GET`, unless the original method was `GET` or `HEAD`. The body is dropped. |
| `303 See Other` | `GET`. The body is dropped. |
| `307 Temporary Redirect`, `308 Permanent Redirect` | The original method |

### When to turn off redirects

With **Follow redirects** off, Nouto shows the `3xx` response itself, including its `Location` header. Use this to check that your API returns the right redirect status and target, or to see where a redirect points before anything follows it, for example when you test for open redirects.

## Saved settings

Nouto saves the per-request values with the request, for example:

```json
{
  "timeout": 60000,
  "maxRedirects": 5
}
```

When you turn redirects off, Nouto saves `"followRedirects": false` and drops `maxRedirects`. When a field is missing, Nouto uses the default from **Settings > Network**, then the built-in default.
