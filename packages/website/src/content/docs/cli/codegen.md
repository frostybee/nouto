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
node packages/cli/dist/bin/cli.js codegen --list-targets
```

Output:

```
  Available code generation targets:

    curl                 Shell - cURL
    javascript-fetch     JavaScript - Fetch
    javascript-axios     JavaScript - Axios
    python-requests      Python - Requests
    csharp               C# - HttpClient
    go                   Go - net/http
    java                 Java - HttpClient
    php                  PHP - cURL
    swift                Swift - URLSession
    dart                 Dart - http
    powershell           PowerShell
    typescript-types     TypeScript Types
```

## Examples

### Generate cURL

```bash
node packages/cli/dist/bin/cli.js codegen api.nouto.json --request "Create User" --target curl
```

### Generate Python and save to file

```bash
node packages/cli/dist/bin/cli.js codegen api.nouto.json \
  --request "Create User" \
  --target python-requests \
  --output create_user.py
```

### Generate Go code

```bash
node packages/cli/dist/bin/cli.js codegen api.nouto.json --request "List Users" --target go
```

## What Gets Included

The generated code includes:

- HTTP method and full URL (with query parameters)
- All enabled headers
- Request body (JSON, form data, URL-encoded, text)
- Authentication supported by the selected target, including Basic, Bearer, API Key, OAuth 2.0, AWS Signature v4, Digest, and NTLM
- TypeScript interface output when the selected target is `typescript-types`

Variable placeholders (`{{variable}}`) are left as-is in the generated code since the CLI does not resolve them during code generation.

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `2` | Collection file not found |
| `4` | Invalid collection format |
| `5` | Request not found |
| `7` | Other error (missing arguments, invalid target) |
