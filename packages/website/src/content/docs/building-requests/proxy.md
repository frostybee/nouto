---
title: Proxy
description: Send Nouto requests through an HTTP, HTTPS, or SOCKS5 proxy, for all requests or for a single request.
sidebar:
  order: 5
---

Nouto can send requests through a proxy server. Set a global proxy in Nouto's settings to cover every request, or set a proxy on one request's **Settings** tab.

## Set a global proxy

1. Open Nouto's settings with the gear icon (**Settings**) and select **Network**.
2. Under **Proxy**, turn on **Enable Global Proxy**.
3. Choose the **Protocol**: `HTTP`, `HTTPS`, or `SOCKS5`.
4. Enter the proxy **Host** and **Port**.
5. If the proxy requires authentication, enter the **Username** and **Password**.
6. To connect to some hosts directly, list them in **No Proxy**. See [Bypass the proxy for some hosts](#bypass-the-proxy-for-some-hosts).

## Set a proxy for one request

1. Open the request and select the **Settings** tab.
2. Under **Proxy**, turn on **Enable proxy for this request**.
3. Fill in the protocol, host, port, optional credentials, and **No proxy** list as for the global proxy.

The request's proxy replaces the global proxy for that request only:

| Proxy settings | Result |
|----------------|--------|
| Request proxy enabled | The request uses its own proxy. |
| Request proxy off, global proxy enabled | The request uses the global proxy. |
| Neither enabled | The request connects directly. |

## Protocols

The **Protocol** option sets how Nouto talks to the proxy server:

| Protocol | Connection to the proxy |
|----------|-------------------------|
| `HTTP` | Plain HTTP. For `https://` targets, Nouto opens a tunnel through the proxy, so the request itself stays encrypted. |
| `HTTPS` | TLS-encrypted connection to the proxy. |
| `SOCKS5` | SOCKS version 5, for example an SSH tunnel opened with `ssh -D`. |

SOCKS4 isn't supported. Nouto has no setting for PAC files or automatic proxy detection, so enter the proxy details by hand. In the VS Code extension, requests that go through a proxy use HTTP/1.1.

## Bypass the proxy for some hosts

The **No proxy** field takes a comma-separated list of hosts that Nouto connects to directly:

```text
localhost, 127.0.0.1, internal.corp
```

Nouto matches each entry against the request's host name:

- A host name matches itself and all of its subdomains. `internal.corp` matches `internal.corp` and `api.internal.corp`.
- An IP address matches only that exact address.
- `*` on its own bypasses the proxy for every host.

Wildcard patterns such as `*.internal.corp` and IP ranges such as `10.0.0.0/8` don't match anything. Use the parent domain instead of a wildcard, and list IP addresses one by one.

When you use a corporate proxy, add `localhost` and `127.0.0.1` so that local development servers stay reachable.

## Example: corporate proxy

To send all requests through a proxy that your IT team gave you, for example `proxy.company.com` on port `3128`:

1. In **Settings > Network**, turn on **Enable Global Proxy**.
2. Set **Protocol** to `HTTP`, **Host** to `proxy.company.com`, and **Port** to `3128`.
3. Set **No Proxy** to `localhost, 127.0.0.1`.

Requests to public hosts go through the proxy. Requests to your local servers connect directly.

## Example: inspect one request in a debugging proxy

To capture a single request in Fiddler, Charles, mitmproxy, or Burp Suite:

1. Open the request, select the **Settings** tab, and turn on **Enable proxy for this request**.
2. Set **Protocol** to `HTTP`, **Host** to `127.0.0.1`, and **Port** to the port the tool listens on. Fiddler and Charles listen on `8888` by default; mitmproxy and Burp Suite listen on `8080`.
3. Send the request. It appears in the tool's traffic list.

Other requests keep their normal proxy settings. To inspect an `https://` request, the tool decrypts the traffic with its own certificate. Select that certificate in **CA Certificate** on the same **Settings** tab, or turn off **Verify SSL certificate** for the request. See [SSL certificates](/building-requests/ssl-certificates).

## Proxy credentials and variables

The proxy fields don't resolve `{{variables}}`. Nouto uses the text you enter as is.

A per-request proxy password is saved with the request. In the desktop app, Nouto moves it into the operating system's keychain and keeps only a reference in the collection file. In the VS Code extension, it's saved as plain text in the collection data, so don't commit or share a collection that contains one. The global proxy is part of Nouto's settings, not of any collection.
