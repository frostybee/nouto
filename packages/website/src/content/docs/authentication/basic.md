---
title: Basic Authentication
description: Configure HTTP Basic auth in Nouto by entering a username and password in the Auth tab.
---

Basic authentication sends a base64-encoded `username:password` string in the `Authorization` header with every request. It is supported by most HTTP servers and is the simplest auth method to configure.

<!-- screenshot: authentication/basic-auth-fields.png -->
![Basic auth username and password fields in the Auth tab](/screenshots/authentication/basic-auth-fields.png)

## Setup

1. Open a request and click the **Auth** tab.
2. Select **Basic Auth** from the type dropdown.
3. Enter your **Username** and **Password**.

The credentials are encoded and sent automatically with each request.

## How It Works

Nouto combines the username and password as `username:password`, encodes the result in Base64, and sends it as an HTTP header:

```
Authorization: Basic dXNlcjpwYXNzd29yZA==
```

The server decodes and validates the credentials on every request. There is no token exchange or session involved.

## Variable Support

Both fields accept `{{variable}}` syntax:

| Field | Example |
|-------|---------|
| Username | `{{API_USERNAME}}` |
| Password | `{{API_PASSWORD}}` |

Store credentials in environment variables to avoid hard-coding them in your requests.

## cURL Export

When you copy a request as cURL, Basic auth is included using the `-u` flag:

```bash
curl https://api.example.com/resource \
  -u 'username:password'
```

## Security Considerations

Base64 encoding is not encryption. Anyone who intercepts the `Authorization` header can decode the credentials immediately. Always use HTTPS when sending Basic auth credentials to external servers.

For public APIs and services, prefer Bearer tokens or API keys over Basic auth when the option exists.
