---
title: OAuth 2.0
description: Fetch an OAuth 2.0 access token in Nouto with the Authorization Code, Client Credentials, Implicit, or Password grant, and send it with your requests.
sidebar:
  order: 4
---

The OAuth 2.0 auth type fetches an access token from your provider and sends it with each request as a Bearer header. Nouto supports four grant types, PKCE for the Authorization Code grant, and refreshing the token when it is about to expire.

## Get an access token

1. Open a request and select the **Auth** tab.
2. Select **OAuth 2.0** from the **Type** dropdown.
3. Under **Grant Type**, select the grant your provider uses.
4. Fill in the fields for that grant. The sections below list them.
5. Click **Get New Access Token**. The button stays disabled until **Client ID** has a value.

For the Authorization Code and Implicit grants, Nouto opens your default browser at the provider's login page. After you sign in and approve access, the browser shows a success page and the token appears on the **Auth** tab. The Client Credentials and Password grants request the token directly, without a browser.

![The Auth tab with OAuth 2.0 selected: the Authorization Code grant with Authorization URL, Token URL, Client ID, Client Secret, and Scope fields, Use PKCE checked, and the Get New Access Token button](../../../assets/screenshots/authentication/oauth2-panel.png)

If the flow fails, the error message from Nouto or the provider appears below the button.

## Grant types

Each grant type shows a different set of fields. Nouto sends the client ID, and the client secret when **Client Secret** has a value, as form parameters in the body of the token request.

### Authorization Code

Use this grant when a user signs in through the provider's login page.

| Field | Required | Description |
|-------|----------|-------------|
| Authorization URL | Yes | The provider's authorization endpoint |
| Token URL | Yes | The provider's token endpoint |
| Client ID | Yes | Your application's client ID |
| Client Secret | No | Leave empty for public clients |
| Scope | No | Space-separated scopes |
| Use PKCE | No | Adds Proof Key for Code Exchange. See [PKCE](#pkce). |

Nouto starts a temporary callback server on your machine, opens the Authorization URL, receives the authorization code on the callback, and exchanges the code for a token at the Token URL.

### Client Credentials

Use this grant for machine-to-machine access with no user sign-in.

| Field | Required | Description |
|-------|----------|-------------|
| Token URL | Yes | The provider's token endpoint |
| Client ID | Yes | Your application's client ID |
| Client Secret | No | Your application's client secret. Most providers require it for this grant. |
| Scope | No | Space-separated scopes |

### Implicit

The provider returns the token in the redirect URL instead of an authorization code.

| Field | Required | Description |
|-------|----------|-------------|
| Authorization URL | Yes | The provider's authorization endpoint |
| Client ID | Yes | Your application's client ID |
| Scope | No | Space-separated scopes |

:::note
The OAuth 2.0 Security Best Current Practice ([RFC 9700](https://www.rfc-editor.org/rfc/rfc9700)) advises against the Implicit grant. Use Authorization Code with PKCE when your provider supports it.
:::

### Password

The resource owner password grant sends the user's username and password to the token endpoint. Use it only with a provider you trust with those credentials.

| Field | Required | Description |
|-------|----------|-------------|
| Token URL | Yes | The provider's token endpoint |
| Client ID | Yes | Your application's client ID |
| Client Secret | No | Your application's client secret |
| Scope | No | Space-separated scopes |
| Username | Yes | The user's username |
| Password | Yes | The user's password |

## Register the redirect URI

For the Authorization Code and Implicit grants, Nouto listens on a random free port on `127.0.0.1` and sends a loopback redirect URI to the provider. The port changes on every flow.

| Platform | Grant | Redirect URI |
|----------|-------|--------------|
| VS Code extension | Authorization Code | `http://localhost:<port>/callback` |
| VS Code extension | Implicit | `http://localhost:<port>/implicit-callback` |
| Desktop app | Both | `http://127.0.0.1:<port>` |

Your provider must accept a loopback redirect URI on any port. Register the URI for your platform in the provider's application settings.

The callback server closes after it receives the callback, or when the flow times out: after 5 minutes in the VS Code extension and 2 minutes in the desktop app. Nouto sends a random `state` value with the authorization request and rejects a callback that returns a different value.

## PKCE

Select **Use PKCE** on the Authorization Code grant to add Proof Key for Code Exchange (RFC 7636). Nouto generates a random `code_verifier`, sends its SHA-256 hash as the `code_challenge` with `code_challenge_method=S256`, and sends the verifier with the token request. Use PKCE for public clients, which can't keep a client secret confidential.

## Token panel

After a successful flow, the **Access Token** panel shows:

- The token with all but its first and last 6 characters hidden.
- The expiry status: `Expires in` with the remaining time, `Expired`, or `No expiration` when the provider didn't return `expires_in`.
- The scope and token type, when the provider returned them.
- **Copy token**, which copies the full token.
- **Refresh token**, when the provider returned a refresh token. It exchanges the refresh token for a new access token.
- **Clear token** (trash icon), which removes the token.

When you send the request, Nouto adds the access token as a Bearer header:

```http
Authorization: Bearer eyJhbGciOiJSUzI1NiIs...
```

Nouto stores the token in the request's auth settings. Save the request to keep the token for later sessions.

## Automatic refresh

When you send a request, Nouto refreshes the token first if all of these are true:

- The token has an expiry time, and it has passed or is less than 30 seconds away.
- The provider returned a refresh token.
- **Token URL** has a value.

If the refresh fails, Nouto sends the request with the old token. The VS Code extension also shows a warning with the error.

## Field values and variables

The OAuth 2.0 fields don't resolve `{{variable}}` references. Nouto sends the values exactly as typed, so a field set to `{{CLIENT_ID}}` sends that literal text to the provider.

**Client Secret** and **Password** are masked. In the desktop app, the client secret and tokens are stored in the operating system keychain. In the VS Code extension, they are saved as plain text with the collection.

## Postman collections

When you import a Postman collection, Nouto keeps the Authorization URL, Token URL, Client ID, Client Secret, and Scope of Postman `oauth2` auth. Nouto copies Postman's grant type value as-is, and only `authorization_code`, `client_credentials`, `implicit`, and `password` match a Nouto grant type. Check the selected grant type after import. Tokens aren't imported, so click **Get New Access Token** before you send.

When you export a collection in Postman format from the VS Code extension, OAuth 2.0 auth is written in Postman's `oauth2` format with the same fields. The desktop app's Postman export doesn't include OAuth 2.0 auth.
