---
title: SSL certificates
description: Control SSL/TLS certificate verification, trust a private CA, and send a client certificate for mutual TLS (mTLS) in Nouto, globally or per request.
sidebar:
  order: 4
---

Nouto verifies the server's certificate on every HTTPS request. Use the SSL settings to trust a private certificate authority (CA), to turn verification off for a test server, or to send a client certificate for mutual TLS (mTLS). Set them for all requests in **Settings > Network**, or for one request on its **Settings** tab.

## Certificate verification

By default, Nouto rejects a server certificate that is expired, self-signed, signed by an untrusted CA, or issued for a different host name, and the request fails with an SSL error.

To turn verification off:

- For one request, open its **Settings** tab and turn off **Verify SSL certificate**.
- For all requests, open Nouto's settings with the gear icon, select **Network**, and turn off **Verify SSL Certificates**.

:::caution
With verification off, Nouto can't detect a man-in-the-middle attack. Turn it off only for development and test servers you control, never for production APIs.
:::

If the server's certificate comes from a private or corporate CA, trust that CA instead of turning verification off.

## Trust a private CA

1. Get the CA's certificate as a PEM file (`.pem` or `.crt`).
2. Open the request's **Settings** tab.
3. Next to **CA Certificate**, select **Browse...** and choose the file.

To trust the CA for all requests, set **CA Certificate** in **Settings > Network**, under **Client Certificate (mTLS)**.

In the VS Code extension, the CA certificate replaces the built-in list of trusted CAs for the request. While it's set, requests to servers with publicly trusted certificates fail verification. In the desktop app, Nouto adds the CA to the built-in list.

## Send a client certificate (mTLS)

Some servers require the client to present its own certificate during the TLS handshake. This is mutual TLS. Nouto sends a client certificate made of a PEM certificate file and a PEM private key file.

1. Open the request and select the **Settings** tab.
2. Under **Client Certificate (mTLS)**, select **Browse...** next to **Certificate file** and choose the certificate (`.pem` or `.crt`).
3. Select **Browse...** next to **Key file** and choose the private key (`.pem` or `.key`).
4. If the key is encrypted, enter the **Passphrase**. The desktop app can't use encrypted keys for HTTP requests; see [Platform differences](#platform-differences).

To send the same certificate with every request, set it in **Settings > Network** under **Client Certificate (mTLS)**.

The file picker also lists `.p12` and `.pfx` files, but Nouto can't read PKCS#12 files for HTTP requests. Convert one to a PEM certificate and an unencrypted PEM key with OpenSSL:

```bash
openssl pkcs12 -in client.p12 -clcerts -nokeys -out client.crt
openssl pkcs12 -in client.p12 -nocerts -nodes -out client.key
```

Keep the unencrypted key file out of version control.

In the desktop app, Nouto moves a request's passphrase into the operating system's keychain. In the VS Code extension, it's saved as plain text with the request.

## Global and per-request settings

The SSL settings exist at two levels:

| Level | Where | Applies to |
|-------|-------|------------|
| Global | **Settings > Network** | Every request without SSL settings of its own |
| Request | The request's **Settings** tab | That request only |

Settings on a request's **Settings** tab take priority over the global settings.

:::note
In the VS Code extension, once you change any SSL field on a request, that request ignores all global SSL settings, including the global client certificate and CA certificate. Set them on the request as well.
:::

## Platform differences

The VS Code extension and the desktop app handle these cases differently:

| Case | VS Code extension | Desktop app |
|------|-------------------|-------------|
| CA certificate | Replaces the built-in trusted CAs | Added to the built-in trusted CAs |
| Encrypted private key with a passphrase | Supported | Not supported for HTTP requests. Use an unencrypted key. |
| Certificate or key file missing at send time | The request is sent without it | The request fails with an error such as `Failed to read cert file` |
