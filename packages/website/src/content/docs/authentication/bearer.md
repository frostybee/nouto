---
title: Bearer token
description: Configure Bearer token authentication in Nouto by pasting a token on the Auth tab.
sidebar:
  order: 2
---

Bearer token authentication sends a token in the `Authorization` header with the `Bearer` scheme. Use it for JWTs, personal access tokens, and other tokens your API issues outside of an OAuth 2.0 flow.

## Set up a Bearer token

1. Open a request and select the **Auth** tab.
2. Select **Bearer Token** from the **Type** dropdown.
3. Paste the token into the **Token** field.

When you send the request, Nouto adds the header:

```http
Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...
```

Nouto sends the token exactly as you enter it, after resolving any variables. Don't type the `Bearer ` prefix into the field.

:::note
The **Token** field shows its value in plain text. Reference a variable instead of pasting the token if other people can see your screen.
:::

## Use a variable for the token

The **Token** field resolves `{{variable}}` references at send time:

```text
{{ACCESS_TOKEN}}
```

When the token changes, update the variable in your environment. Every request that references `{{ACCESS_TOKEN}}` uses the new value on its next send. Store long-lived tokens, such as GitHub personal access tokens, in a [secret variable](/variables/secrets).

If your token comes from an OAuth 2.0 provider, use the [OAuth 2.0](/authentication/oauth2) auth type instead. It fetches the token and refreshes it before it expires.

## Copy as cURL

To get a cURL command, right-click a saved request in the sidebar and select **Copy as cURL**. Nouto writes the token as a header:

```bash
curl \
  https://api.example.com/resource \
  -H \
  'Authorization: Bearer eyJhbGci...'
```

Nouto resolves variables in the copied command, so the command can contain the real token.
