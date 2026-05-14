---
title: Code Generation
description: Generate code snippets from your requests in multiple languages and libraries.
---

Nouto can generate code from HTTP style requests across common languages and HTTP libraries. It also includes a TypeScript type output target that infers interfaces from sample JSON.

## Supported Languages

| Language | Library / Client |
|----------|-----------------|
| cURL | cURL command |
| JavaScript | fetch |
| JavaScript | axios |
| Python | requests |
| C# | HttpClient |
| Go | net/http |
| Java | HttpClient |
| PHP | cURL |
| Swift | URLSession |
| Dart | http |
| PowerShell | Invoke-RestMethod |
| TypeScript | Interface output from sample JSON |

## How to Use

1. Configure your request with method, URL, headers, body, and auth.
2. Click the **Code** button in the request panel.
3. Select your target language and library.
4. Copy the generated code.
