---
title: SSL Certificates
description: Configure SSL/TLS verification and client certificates (mTLS) for requests in Nouto.
---

The **Settings** tab in the request editor (and the global Settings page) contains SSL/TLS options for controlling certificate verification and providing client certificates for mutual TLS (mTLS).

<!-- screenshot: building-requests/ssl-panel.png -->
![SSL panel showing the verify toggle, client certificate path field, and key path field](/screenshots/building-requests/ssl-panel.png)

## SSL Verification

By default, Nouto verifies the server's SSL certificate against trusted root CAs. If verification fails (expired certificate, self-signed certificate, hostname mismatch), the request is rejected with an SSL error.

You can disable verification per-request in the **Settings** tab, or globally in **Settings > Network**.

### When to Disable Verification

- Local development servers with self-signed certificates
- Internal staging environments with corporate CA certificates not trusted by the OS
- Testing certificate error handling in your own API

:::caution
Disabling SSL verification removes protection against man-in-the-middle attacks. Only disable it for trusted internal or development environments, never for production APIs.
:::

## Client Certificates (mTLS)

Some APIs require you to present a client certificate in addition to the server's certificate verification. This is mutual TLS (mTLS), common in high-security enterprise APIs, financial services, and service-to-service authentication.

### Adding a Client Certificate

1. Open the request and go to the **Settings** tab.
2. In the **SSL** section, click **Select Certificate** to pick your certificate file.
3. Click **Select Key** to pick the private key file.
4. If the key is encrypted, enter the **Passphrase**.

Supported certificate formats: PEM (`.pem`, `.crt`), and key files (`.key`, `.pem`).

On the desktop app, Nouto uses the system file picker. In VS Code, a file dialog opens within the editor.

### How mTLS Works

When a server requests a client certificate, Nouto presents your configured certificate during the TLS handshake. The server validates it against its trusted CA list. If validation passes, the connection is established with mutual authentication.

## Global vs Per-Request

SSL settings work at two levels:

| Level | Location | Applies to |
|-------|----------|------------|
| Global | Settings > Network | All requests by default |
| Per-request | Request > Settings tab | That request only |

Per-request settings always override the global setting. A request can have verification disabled while the global setting leaves it enabled, or vice versa.

## Platform Support

| Feature | VS Code extension | Desktop app |
|---------|-----------------|-------------|
| SSL verification toggle | Supported | Supported |
| Client certificates (mTLS) | Supported | Supported |
| Certificate passphrase | Supported | Supported |
