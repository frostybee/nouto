---
title: Code generation
description: Generate a snippet for the current request in cURL, JavaScript, Python, C#, Go, Java, PHP, Swift, Dart, or PowerShell, or infer TypeScript types from a JSON body.
sidebar:
  order: 5
---

Nouto turns the open HTTP request into a snippet for one of 11 HTTP clients, so you can paste the call into a script or an app. A twelfth target, **TypeScript Types**, infers TypeScript interfaces from JSON in the request body.

## Generate a snippet

1. Open an HTTP request and enter a URL. The **Code** button stays disabled while the URL is empty.
2. Click **Code** next to **Send**.
3. In the **Generate Code** dialog, select a target.
4. Click **Copy to Clipboard**.

In VS Code, **Open in New Tab** opens the snippet in an editor tab. In the desktop app, the same button copies the snippet to the clipboard. Nouto remembers the last target you selected.

:::caution
Nouto resolves `{{variables}}` from the active environment before it generates the snippet. The code contains the real values, including tokens, passwords, and API keys. Check the snippet before you share it.
:::

To copy a saved request as a cURL command without opening it, right-click the request in the sidebar and select **Copy as cURL**.

## Targets

The **Generate Code** dialog lists these targets:

| Target | Output |
|--------|--------|
| cURL | `curl` command |
| JavaScript - Fetch | Fetch API call |
| JavaScript - Axios | Axios call |
| Python - Requests | `requests` call |
| C# - HttpClient | `System.Net.Http.HttpClient` call |
| Go - net/http | `net/http` program |
| Java - HttpClient | `java.net.http.HttpClient` call (Java 11 or later) |
| PHP - cURL | PHP `curl_*` functions |
| Swift - URLSession | `URLSession` call |
| Dart - http | `package:http` call |
| PowerShell | `Invoke-RestMethod` call |
| TypeScript Types | TypeScript interfaces inferred from the request body |

The same targets are available from the command line. See [CLI code generation](/cli/codegen).

## Request body

Snippets include a body only for `POST`, `PUT`, and `PATCH` requests. When the request has no `Content-Type` header, Nouto adds one that matches the body type.

| Body type | Generated code |
|-----------|----------------|
| JSON | Body text with `Content-Type: application/json` |
| Text | Body text with `Content-Type: text/plain` |
| XML | Body text with `Content-Type: application/xml` |
| URL-encoded | Encoded `key=value` pairs from the enabled rows |
| Form data | Multipart form built with the target library, including file fields |
| GraphQL | JSON payload with `query`, plus `variables` and `operationName` when set |
| Binary | cURL only, as `--data-binary @<file>`. Other targets omit the body. |

## Authentication

The snippet carries the request's auth settings:

| Auth type | Generated code |
|-----------|----------------|
| Basic | The library's basic auth option, or an `Authorization: Basic` header |
| Bearer Token | `Authorization: Bearer <token>` header |
| API Key | The key as a header or a query parameter, matching the request |
| OAuth 2.0 | `Authorization: Bearer` header with the request's current access token, or `<access_token>` when it has none |
| Digest, NTLM | Built-in support where the library has it, for example `--digest` and `--ntlm` in cURL. Fetch, Axios, Go, Java, and Dart get a comment instead. |
| AWS Signature v4 | `--aws-sigv4` in cURL, `CURLOPT_AWS_SIGV4` in PHP, and `requests_aws4auth` in Python. Other targets get a comment with the region and service. |

## Proxy and SSL settings

When the request has proxy or SSL settings, the snippet includes them where the library supports them. For example, cURL gets `--proxy`, `--insecure`, `--cert`, and `--key`, and Python gets `proxies`, `verify`, and `cert` arguments. Targets without an equivalent option, such as Fetch and Dart, get a comment that describes the setting.

## Example

A `POST` request with a JSON body and a Bearer token produces this cURL command:

```bash
curl \
  -X \
  POST \
  https://api.example.com/data \
  -H \
  'Authorization: Bearer my-token' \
  -H \
  'Content-Type: application/json' \
  -d \
  '{"name":"John","age":30}'
```

Nouto added the `Content-Type` header because the body type is JSON and the request had no `Content-Type` header of its own.

## TypeScript types

The **TypeScript Types** target reads JSON from the request body, not from the response. Paste a sample response into the body to generate types for it. Nouto names the root interface after the last non-numeric segment of the URL path, in singular form, so `/api/users` produces a `User` interface. When the JSON is an array, Nouto also adds a `UserResponse` type for the array.
