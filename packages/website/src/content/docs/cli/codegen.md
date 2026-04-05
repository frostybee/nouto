---
title: "CLI: Code Generation"
description: Generate code snippets from Nouto collection requests using the CLI.
sidebar:
  order: 4
---

The `nouto codegen` command generates a code snippet from a request in a collection file.

## Usage

```bash
nouto codegen <collection-file> --request <name-or-id> --target <lang> [options]
```

## Options

| Option | Description | Default |
|--------|-------------|---------|
| `--request <name-or-id>` | Request name or ID (required) | |
| `-t, --target <lang>` | Target language (required) | |
| `-o, --output <file>` | Output file (stdout if omitted) | stdout |
| `--list-targets` | List all available targets | |

## List Available Targets

```bash
nouto codegen --list-targets
```

Output:

```
  Available code generation targets:

    curl                 Shell - cURL
    js-fetch             JavaScript - Fetch
    js-axios             JavaScript - Axios
    python-requests      Python - Requests
    csharp-httpclient    C# - HttpClient
    go-nethttp           Go - net/http
    java-httpclient      Java - HttpClient
    php-curl             PHP - cURL
    swift-urlsession     Swift - URLSession
    dart-http            Dart - http
    powershell           PowerShell
```

## Examples

### Generate cURL

```bash
nouto codegen api.nouto.json --request "Create User" --target curl
```

### Generate Python and save to file

```bash
nouto codegen api.nouto.json \
  --request "Create User" \
  --target python-requests \
  --output create_user.py
```

### Generate Go code

```bash
nouto codegen api.nouto.json --request "List Users" --target go-nethttp
```

## What Gets Included

The generated code includes:

- HTTP method and full URL (with query parameters)
- All enabled headers
- Request body (JSON, form data, URL-encoded, text)
- Authentication (Basic, Bearer, API Key)
- Proxy and SSL settings (where the language supports them)

Variable placeholders (`{{variable}}`) are left as-is in the generated code since the CLI does not resolve them during code generation.
