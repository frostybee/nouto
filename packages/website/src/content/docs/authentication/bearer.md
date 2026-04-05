---
title: Bearer Token
description: Configure Bearer token authentication in Nouto by pasting a token into the Auth tab.
sidebar:
  order: 2
---

Bearer token authentication sends a token in the `Authorization` header using the `Bearer` scheme. It is the most common auth method for modern APIs, covering JWT tokens, OAuth access tokens, and service account keys.

<!-- screenshot: authentication/bearer-token-field.png -->
![Bearer token input field in the Auth tab](/screenshots/authentication/bearer-token-field.png)

## Setup

1. Open a request and click the **Auth** tab.
2. Select **Bearer Token** from the type dropdown.
3. Paste your token into the **Token** field.

Nouto adds the `Authorization` header automatically on every request.

## How It Works

The token is sent as-is in the Authorization header:

```
Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...
```

No encoding or transformation is applied. The token you enter is exactly what the server receives.

## Variable Support

The token field accepts `{{variable}}` syntax:

```
{{ACCESS_TOKEN}}
{{JWT_TOKEN}}
{{SERVICE_KEY}}
```

Using an environment variable lets you rotate tokens without editing individual requests. Set the variable in your active environment and all requests using `{{ACCESS_TOKEN}}` pick up the new value immediately.

## Common Use Cases

**JWT tokens**: Paste the full JWT string. For tokens obtained via OAuth flows, use [OAuth 2.0](/authentication/oauth2) instead, which handles token fetching and refresh automatically.

**Static API tokens**: Many services issue long-lived tokens (GitHub personal access tokens, Stripe secret keys, etc.). Store these in a secret environment variable and reference them with `{{variable}}`.

**Short-lived tokens**: If your token expires frequently, consider using a [pre-request script](/testing/scripts) to fetch a fresh token and store it in a variable before each request.

## cURL Export

Bearer auth is included when you copy a request as cURL:

```bash
curl https://api.example.com/resource \
  -H 'Authorization: Bearer eyJhbGci...'
```
