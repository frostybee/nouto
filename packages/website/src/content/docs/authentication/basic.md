---
title: Basic authentication
description: Configure HTTP Basic auth in Nouto by entering a username and password on the Auth tab.
sidebar:
  order: 1
---

Basic authentication sends a username and password with every request. Nouto joins them as `username:password`, encodes the result in Base64, and sends it in the `Authorization` header.

## Set up Basic auth

1. Open a request and select the **Auth** tab.
2. Select **Basic Auth** from the **Type** dropdown.
3. Enter the **Username** and **Password**.

When you send the request, Nouto adds the header:

```http
Authorization: Basic dXNlcjpwYXNzd29yZA==
```

## Use variables for credentials

Both fields resolve `{{variable}}` references at send time:

| Field | Example |
|-------|---------|
| Username | `{{API_USERNAME}}` |
| Password | `{{API_PASSWORD}}` |

Reference a [secret variable](/variables/secrets) for the password to keep it out of the saved request.

## Copy as cURL

To get a cURL command, right-click a saved request in the sidebar and select **Copy as cURL**. Nouto writes Basic auth with the `-u` flag:

```bash
curl \
  https://api.example.com/resource \
  -u \
  username:password
```

Nouto resolves variables in the copied command, so the command can contain the real password.

## Use HTTPS with Basic auth

:::caution
Base64 is an encoding, not encryption. Anyone who can read the request can decode the credentials. Send Basic auth only over HTTPS, or to a server on your own machine.
:::
