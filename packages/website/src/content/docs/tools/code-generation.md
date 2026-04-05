---
title: Code Generation
description: Generate code snippets from Nouto requests in 11 languages including cURL, JavaScript, Python, Go, and more.
sidebar:
  order: 5
---

Nouto generates ready-to-use code from any request in 11 languages. The generated snippet includes the full request configuration: method, URL, headers, auth, query parameters, and body.

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

The JSON Explorer also generates TypeScript interfaces, Zod schemas, Rust structs, Go structs, Python dataclasses, and JSON Schema from response data. See [JSON Explorer](/response/json-explorer) for details.
