---
title: Digest authentication
description: Configure HTTP Digest auth (RFC 7616) in Nouto for servers that respond with a Digest challenge.
sidebar:
  order: 7
---

HTTP Digest authentication (RFC 7616) is a challenge-response scheme. Instead of sending the password, Nouto sends a hash computed from the password, a server-provided nonce, and the request. Use it for servers that respond to an unauthenticated request with `WWW-Authenticate: Digest`.

## Set up Digest auth

1. Open a request and select the **Auth** tab.
2. Select **Digest** from the **Type** dropdown.
3. Enter the **Username** and **Password**.

Both fields resolve `{{variable}}` references at send time.

## Digest handshake

Each time you click **Send**, Nouto runs the handshake:

1. Nouto sends the request without credentials.
2. The server responds with `401 Unauthorized` and a `WWW-Authenticate: Digest` header that contains the realm, nonce, and the supported `qop` and algorithm.
3. Nouto computes the response hash from your username and password, the challenge, and the request method and URI.
4. Nouto sends the request again with an `Authorization: Digest` header that contains the hash.

The response panel shows the server's response to the second request. If the first response isn't a `401` with a Digest challenge, Nouto shows that response and doesn't retry.

Every send makes two requests, so a Digest request takes one more round trip than a request with Basic auth.

## Supported algorithms and qop

The server's challenge selects the algorithm. Both the VS Code extension and the desktop app support:

| Algorithm | Notes |
|-----------|-------|
| `MD5` | Used when the challenge doesn't name an algorithm |
| `SHA-256` | Defined in RFC 7616 |
| `MD5-sess` | Session variant of MD5 |
| `SHA-256-sess` | Session variant of SHA-256 |

Nouto uses `qop=auth` when the challenge offers it, and the legacy calculation without `qop` when the challenge has no `qop`. Nouto doesn't support `qop=auth-int`, which also hashes the request body.
