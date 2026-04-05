---
title: Digest Authentication
description: Configure HTTP Digest auth (RFC 7616) in Nouto for servers that require challenge-response credential verification.
sidebar:
  order: 7
---

HTTP Digest authentication (RFC 7616) is a challenge-response protocol that avoids sending passwords in plaintext. Unlike Basic auth, which base64-encodes credentials, Digest auth hashes the password with a server-provided nonce. This makes it more secure over unencrypted connections.

<!-- screenshot: authentication/digest-auth-fields.png -->
![Digest auth username and password fields in the Auth tab](/screenshots/authentication/digest-auth-fields.png)

## Setup

1. Open a request and click the **Auth** tab.
2. Select **Digest** from the type dropdown.
3. Enter your **Username** and **Password**.

Nouto handles the two-request handshake automatically when you click **Send**.

## How It Works

The Digest flow is transparent. You only see the final response:

1. Nouto sends the initial request without credentials.
2. The server responds with `401 Unauthorized` and a `WWW-Authenticate: Digest` header containing a challenge: realm, nonce, qop, and algorithm.
3. Nouto computes a hash from your username, password, the challenge parameters, and the request method and URI.
4. Nouto resends the request with an `Authorization: Digest` header containing the computed hash.
5. The server validates the hash and returns the actual response.

## Supported Algorithms

The algorithm is determined by the server's challenge. Nouto supports:

| Algorithm | Notes |
|-----------|-------|
| MD5 | Default, most widely supported |
| SHA-256 | More secure, defined in RFC 7616 |
| MD5-sess | Session-based MD5 variant |
| SHA-256-sess | Session-based SHA-256 variant |

## Supported QOP

| QOP value | Notes |
|-----------|-------|
| `auth` | Authentication only. Most servers use this. |
| (none) | Legacy mode without QOP, for older servers |

`auth-int` (body integrity protection) is not currently supported.

## Variable Support

Both fields accept `{{variable}}` syntax:

| Field | Example |
|-------|---------|
| Username | `{{DIGEST_USERNAME}}` |
| Password | `{{DIGEST_PASSWORD}}` |

## When to Use Digest Auth

Digest auth is common on:

- Network equipment: routers, IP cameras, NAS devices, and IoT hardware
- Older enterprise web servers and appliances
- Systems that cannot use HTTPS but require more protection than Basic auth

If the server supports HTTPS and a modern auth method, prefer Bearer tokens or OAuth 2.0. Digest auth adds two HTTP round-trips per request, which increases latency compared to stateless methods.

## Platform Support

| Platform | Digest auth |
|----------|-------------|
| VS Code extension | Supported (MD5, SHA-256) |
| Desktop app | Supported (MD5, SHA-256) |
