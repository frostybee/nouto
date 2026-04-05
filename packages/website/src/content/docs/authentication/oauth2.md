---
title: OAuth 2.0
description: Use OAuth 2.0 in Nouto to authenticate with APIs supporting Authorization Code, Client Credentials, Implicit, or Password grant types.
sidebar:
  order: 4
---

Nouto supports all four major OAuth 2.0 grant types, with PKCE for public clients and automatic token refresh. Configure the flow once, fetch a token, and Nouto attaches it to every request automatically.

<!-- screenshot: authentication/oauth2-panel.png -->
![OAuth 2.0 panel showing grant type dropdown, client ID, client secret, scopes, and token display area](/screenshots/authentication/oauth2-panel.png)

## Setup

1. Open a request and click the **Auth** tab.
2. Select **OAuth 2.0** from the type dropdown.
3. Choose a **Grant Type** and fill in the required fields.
4. Click **Get New Access Token** to start the flow.

## Grant Types

### Authorization Code

The standard flow for web and single-page applications. Nouto opens the system browser for user login, then exchanges the authorization code for an access token.

| Field | Required | Description |
|-------|----------|-------------|
| Authorization URL | Yes | Provider's authorization endpoint |
| Token URL | Yes | Provider's token endpoint |
| Client ID | Yes | Your application's client ID |
| Client Secret | No | Omit for public clients |
| Scope | No | Space-separated list of scopes to request |
| Use PKCE | No | Recommended for public clients (see below) |

**Flow:**
1. Nouto starts a temporary local callback server.
2. The system browser opens the Authorization URL.
3. After the user authorizes, the provider redirects back with an authorization code.
4. Nouto exchanges the code for an access token at the Token URL.

<!-- screenshot: authentication/oauth2-browser-callback.png -->
![System browser showing the OAuth authorization page and Nouto waiting for the callback](/screenshots/authentication/oauth2-browser-callback.png)

### Client Credentials

Machine-to-machine authentication. No browser interaction.

| Field | Required | Description |
|-------|----------|-------------|
| Token URL | Yes | Provider's token endpoint |
| Client ID | Yes | Your application's client ID |
| Client Secret | Yes | Your application's client secret |
| Scope | No | Space-separated list of scopes |

### Implicit

Legacy browser-based flow. The token is returned directly in the redirect URL fragment without a code exchange step.

| Field | Required | Description |
|-------|----------|-------------|
| Authorization URL | Yes | Provider's authorization endpoint |
| Client ID | Yes | Your application's client ID |
| Scope | No | Space-separated list of scopes |

:::note
The Implicit grant is considered less secure than Authorization Code with PKCE. Use Authorization Code when your provider supports it.
:::

### Password (Resource Owner)

Direct username and password exchange. Suitable only for trusted first-party applications where the user trusts the client with their credentials.

| Field | Required | Description |
|-------|----------|-------------|
| Token URL | Yes | Provider's token endpoint |
| Client ID | Yes | Your application's client ID |
| Client Secret | No | Your application's client secret |
| Username | Yes | User's username |
| Password | Yes | User's password |
| Scope | No | Space-separated list of scopes |

## PKCE

Enable **Use PKCE** on the Authorization Code grant to add Proof Key for Code Exchange. Nouto generates a random `code_verifier`, derives a `code_challenge` using SHA-256 and Base64url encoding, and includes both in the appropriate steps of the flow. PKCE is recommended for public clients (mobile apps, SPAs) and any situation where the client secret cannot be kept confidential.

## Token Management

After a successful flow, the token panel shows:

- **Masked token**: first and last 6 characters are visible
- **Expiration**: a green countdown timer, or a red "Expired" label
- **Copy**: copies the full token to the clipboard
- **Refresh**: exchanges the refresh token for a new access token
- **Clear**: removes the stored token

When you send a request, the access token is attached as a Bearer header:

```
Authorization: Bearer eyJhbGciOiJSUzI1NiIs...
```

### Auto-Refresh

If the token is expired or within 30 seconds of expiry when you click **Send**, Nouto refreshes it automatically using the stored refresh token before sending the request.

## Variable Support

All OAuth 2.0 fields accept `{{variable}}` syntax:

| Field | Example |
|-------|---------|
| Authorization URL | `{{OAUTH_AUTH_URL}}` |
| Token URL | `{{OAUTH_TOKEN_URL}}` |
| Client ID | `{{OAUTH_CLIENT_ID}}` |
| Client Secret | `{{OAUTH_CLIENT_SECRET}}` |
| Scope | `{{OAUTH_SCOPE}}` |

## Security

- Client secret fields are masked by default.
- The callback server binds to `127.0.0.1` only and shuts down after receiving the authorization code.
- The callback server has a 5-minute timeout. If no callback arrives, it closes automatically.
- Credentials sent over unencrypted HTTP trigger a security warning.

## Postman Compatibility

- **Import**: Postman `oauth2` auth is imported with grant type, URLs, client ID, client secret, and scope preserved.
- **Export**: Nouto OAuth 2.0 auth exports to Postman's `oauth2` format with matching field names.
