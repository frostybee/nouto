---
title: "CLI: Code generation"
description: Generate a code snippet for a saved request with the Nouto CLI, in one of 12 targets such as cURL, Python Requests, or Go.
sidebar:
  order: 4
---

The `nouto codegen` command prints a code snippet that sends a saved request from a collection file. It uses the same generators as [code generation](/tools/code-generation) in the app.

## Usage

```bash
nouto codegen <collection-file> --request <name-or-id> --target <target> [options]
nouto codegen --list-targets
```

## Options

`nouto codegen` accepts these options:

| Option | Description | Default |
|--------|-------------|---------|
| `--request <name-or-id>` | Request to generate code for. Required. Matches the request ID first, then the name, ignoring case. | None |
| `-t, --target <target>` | Target ID from `--list-targets`. Required. | None |
| `-o, --output <file>` | Write the snippet to this file | stdout |
| `--list-targets` | Print the available targets and exit. Needs no collection file. | Off |

## Targets

`nouto codegen --list-targets` prints the target IDs and labels:

```text
  Available code generation targets:

    curl                 cURL
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

Pass the ID in the first column to `--target`. The command doesn't validate the ID: an unknown target prints `// Unknown target: <id>` and exits with `0`.

## Examples

Print a cURL command for the `Create User` request:

```bash
nouto codegen api.nouto.json --request "Create User" --target curl
```

Save a Python snippet to a file:

```bash
nouto codegen api.nouto.json \
  --request "Create User" \
  --target python-requests \
  --output create_user.py
```

## What the snippet contains

The snippet includes the request's method, URL, and body, and the auth configured on the request itself. Basic, Bearer Token, API Key, OAuth 2.0, AWS Signature v4, Digest, and NTLM auth appear in the snippet when the selected target supports them. Auth inherited from a folder or the collection isn't included.

:::caution
The CLI leaves the entries from the request's **Query** and **Headers** tabs out of the snippet. Headers that come from the auth settings and the body type, such as `Authorization` and `Content-Type`, are still included. To get a snippet with every header and query parameter, use [code generation](/tools/code-generation) in the app.
:::

The CLI doesn't resolve variables. A `{{variable}}` reference appears in the snippet as written.

The `typescript-types` target generates TypeScript interfaces from the request's JSON body instead of a code snippet. If the request has no JSON body, the output is a comment that says so.

## Exit codes

`nouto codegen` exits with `5` when no request matches `--request`, and with `7` when the collection file, `--request`, or `--target` is missing. [Exit codes](/cli/#exit-codes) lists the other codes.
