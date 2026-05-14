---
title: Code Generation
description: Generate code snippets from Nouto requests across HTTP clients and TypeScript type output.
sidebar:
  order: 5
---

Nouto generates ready to use code from HTTP style requests. The generated snippet includes the request method, URL, headers, supported auth, query parameters, and body. A separate TypeScript target can infer interfaces from sample JSON in the request body.

## How to Use

1. Configure your request (URL, method, headers, body, auth).
2. Click the **Code** button in the URL bar.
3. Select a language from the tabs.
4. Click **Copy** to copy the snippet, or **Open in New Tab** to edit it in VS Code.

The generated code updates automatically when you change the request. Your last selected language is remembered across sessions.

## Supported Languages

| Language | Library |
|----------|---------|
| Shell | cURL |
| JavaScript | Fetch API |
| JavaScript | Axios |
| Python | requests |
| C# | HttpClient |
| Go | net/http |
| Java | HttpClient (Java 11+) |
| PHP | cURL functions |
| Swift | URLSession |
| Dart | package:http |
| PowerShell | Invoke-RestMethod |
| TypeScript | Interface output from sample JSON |

## Authentication

All generators handle the configured auth type:

| Auth Type | Generated Code |
|-----------|----------------|
| Basic | Base64-encoded `Authorization: Basic` header |
| Bearer | `Authorization: Bearer <token>` header |
| API Key (Header) | Custom header with key name and value |
| API Key (Query) | Key appended as URL query parameter |
| OAuth 2.0 | `Authorization: Bearer <access_token>` placeholder |
| AWS Signature v4 | Signing headers (language-dependent) |
| Digest | Comment noting digest auth with credentials |
| NTLM | Comment noting NTLM auth with credentials |

## Body Types

| Body Type | Generated Code |
|-----------|----------------|
| JSON | Serialized body with `Content-Type: application/json` |
| Text | Raw string with `Content-Type: text/plain` |
| URL-encoded | Encoded key-value pairs |
| Form Data (text) | Multipart form construction |
| Form Data (file) | File reference with path comment |
| Binary | Not included (file paths are local) |

## Proxy and SSL

When proxy or SSL settings are configured on the request, the generated code includes them where the language supports it:

- **cURL**: `--proxy`, `--insecure`, `--cert`, `--key` flags
- **Python**: `proxies`, `verify`, `cert` parameters
- Other languages: comments noting the proxy/SSL configuration

## cURL Example

```bash
curl -X POST https://api.example.com/data \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer my-token' \
  -d '{"name":"John","age":30}'
```

## TypeScript Type Generation

The CLI exposes the same code generation targets through `nouto codegen`. See [CLI: Code Generation](/cli/codegen) for command usage.
