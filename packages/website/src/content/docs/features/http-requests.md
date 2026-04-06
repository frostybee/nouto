---
title: HTTP Requests
description: Send HTTP requests with full control over method, URL, params, headers, body, and authentication.
---

The request editor is the core of Nouto. It provides a tabbed interface for building and sending HTTP requests, inspecting responses, and running tests.

## Supported Methods

`GET` `POST` `PUT` `PATCH` `DELETE` `HEAD` `OPTIONS`

Select the method from the dropdown to the left of the URL bar.

## Request Editor Tabs

| Tab | Contents |
|-----|----------|
| **Params** | Query parameters and path parameters as key-value pairs |
| **Headers** | Request headers with autocomplete for standard header names |
| **Auth** | Authentication (see below) |
| **Body** | Request body in JSON, XML, text, form data, URL-encoded, binary, or GraphQL format |
| **Tests** | GUI assertions to validate the response automatically |
| **Scripts** | Pre-request and post-response JavaScript |
| **Notes** | Free-text notes saved with the request |

## Sending a Request

Press `Ctrl+Enter` or click **Send**. While a request is in flight, a cancel button replaces Send. Press `Escape` to cancel.

Nouto substitutes all `{{variables}}` in the URL, params, headers, and body before sending.

## Authentication

Select an auth type from the **Auth** tab:

| Type | Description |
|------|-------------|
| None | No authentication header |
| Basic | Username and password encoded as Base64 |
| Bearer Token | `Authorization: Bearer <token>` header |
| API Key | Key sent as a header or query parameter |
| OAuth 2.0 | Authorization Code, Client Credentials, Implicit, or Password grant with PKCE and auto-refresh |
| AWS Signature v4 | SigV4 signing for AWS service requests |
| NTLM | Windows-integrated authentication |
| Digest | HTTP Digest authentication (RFC 7616) |

Requests can also inherit auth from a parent folder or collection. See [Auth Inheritance](/authentication/inheritance).

## Response Viewer

After sending, the response panel shows:

- **Status code** and status text (color-coded by range)
- **Response time** and body size
- **Body**: pretty-printed with syntax highlighting for JSON, XML, and HTML; raw text toggle available
- **Headers**: all response headers
- **Cookies**: cookies set by the response
- **Timing**: per-phase breakdown (DNS, connect, TLS, TTFB, download)
- **Tests**: assertion pass/fail results

## Saving a Request

Press `Ctrl+S` to save the current request to a collection. Saved requests appear in the sidebar and are restored on next open.
