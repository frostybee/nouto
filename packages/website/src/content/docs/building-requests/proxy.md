---
title: Proxy
description: Route Nouto requests through an HTTP, HTTPS, or SOCKS5 proxy, globally or per-request.
sidebar:
  order: 5
---

Nouto supports routing requests through a proxy server. You can configure a global proxy that applies to all requests, or override it per-request to route specific requests through a different proxy.

<!-- screenshot: building-requests/proxy-settings.png -->
![Proxy configuration showing protocol selector, host, port, username, password, and no-proxy list fields](/screenshots/building-requests/proxy-settings.png)

## Global Proxy

A global proxy routes all requests by default.

1. Open **Settings** (the gear icon).
2. Scroll to the **Proxy** section.
3. Enable **Use proxy**.
4. Set the **Protocol** (`HTTP`, `HTTPS`, or `SOCKS5`), **Host**, and **Port**.
5. Optionally enter **Username** and **Password** if the proxy requires authentication.
6. Optionally add hostnames to the **No proxy** list to bypass the proxy for those addresses.

## Per-Request Proxy

A per-request proxy overrides the global proxy for one specific request.

1. Open the request and go to the **Settings** tab.
2. Enable **Use proxy for this request**.
3. Configure protocol, host, port, credentials, and bypass list as needed.

Per-request settings always take priority. If neither is enabled, requests connect directly.

| Condition | Proxy used |
|-----------|-----------|
| Per-request proxy enabled | Per-request proxy |
| Only global proxy enabled | Global proxy |
| Neither enabled | Direct connection |

## Supported Protocols

| Protocol | Notes |
|----------|-------|
| HTTP | Standard HTTP proxy, most common |
| HTTPS | TLS-encrypted proxy tunnel |
| SOCKS5 | Useful for SSH tunnels and advanced routing |

SOCKS4 is not supported. System proxy auto-detection and PAC files are not supported; configure the proxy manually.

## No Proxy (Bypass List)

The **No proxy** field accepts a comma-separated list of hostnames that connect directly, bypassing the proxy:

```
localhost, 127.0.0.1, *.internal.corp, 10.0.0.0/8
```

Always add `localhost` and `127.0.0.1` to the bypass list when using a corporate proxy, so local development servers remain reachable.

## Common Scenarios

### Corporate Network

Your organization routes all outbound traffic through a corporate proxy:

1. Open Settings, enable global proxy.
2. Set protocol to `HTTP`, host to `proxy.company.com`, port to `3128` (or as provided by IT).
3. Add `localhost, 127.0.0.1` to No proxy.

All requests now route through the corporate proxy. Local requests still connect directly.

### Debugging with Fiddler, Charles, or mitmproxy

To inspect a specific request in an HTTP debugging tool:

1. Open the request, go to **Settings** tab, enable the per-request proxy.
2. Set protocol to `HTTP`, host to `127.0.0.1`, port to `8888` (Fiddler default) or `8080` (Charles/Burp default).
3. Send the request. It appears in the proxy tool's traffic log.

Other requests that do not have a per-request proxy configured are unaffected.

## Limitations

- When a proxy is active, HTTP/2 is downgraded to HTTP/1.1.
- Proxy credentials are not encrypted at rest beyond the standard collection storage.
