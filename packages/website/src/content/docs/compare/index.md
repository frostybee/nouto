---
title: Feature comparison
description: Compare Nouto with Postman, Insomnia, Bruno, Yaak, and Thunder Client, feature by feature, on each tool's free tier.
---

This page compares Nouto with five other API clients: Postman, Insomnia, Bruno, Yaak, and Thunder Client. Each cell describes what the tool offers on its free tier.

Last reviewed: October 5, 2026. Competitor information comes from each product's website, documentation, pricing page, and public source code, and it changes often. If a cell is wrong, [open an issue](https://github.com/frostybee/nouto/issues) with the correction and a link to the source.

## How to read the tables

The cells use these values:

| Value | Meaning |
|-------|---------|
| Yes | Supported in the free tier |
| No | Not available |
| Partial | Limited support |
| Paid | Requires a paid plan |
| Via plugin | Available through a plugin, not built in |
| `-` | Not confirmed as of October 2026 |

## Basics

| Feature | Nouto | Postman | Insomnia | Bruno | Yaak | Thunder Client |
|---------|:-----:|:-------:|:--------:|:-----:|:----:|:--------------:|
| Open source | Yes (MIT) | No | Yes (Apache 2.0) | Yes (MIT) | Yes (MIT) | No |
| Free tier | Yes (full) | Yes (limited) | Yes (limited) | Yes (most features) | Personal use only | Yes (very limited) |
| Account required | No | Partial | Partial | No | No | No |
| Telemetry | No | Yes | Yes (opt-out) | Yes (daily ping) | No | Yes (opt-out) |
| Local-first storage | Yes | No | Yes | Yes | Yes | Yes |
| Desktop app | Yes | Yes | Yes | Yes | Yes | No |
| VS Code extension | Yes | Yes | No | Yes | No | Yes |
| Web version | No | Yes | No | No | No | No |
| CLI | Yes (build from source) | Yes | Yes | Yes | Yes | Paid |

Nouto has no paid tier, no account, and no telemetry. The Nouto CLI isn't published to npm yet, so you [build it from the repository](/cli/).

Postman requires an account for most features and stores data in the Postman cloud by default. Bruno sends one anonymous ping a day with the operating system and app version. Yaak is free for personal use and requires a license for work use. Thunder Client's free tier excludes WebSocket, SSE, gRPC, scripting, environments, the collection runner, and the CLI.

## Protocols

| Feature | Nouto | Postman | Insomnia | Bruno | Yaak | Thunder Client |
|---------|:-----:|:-------:|:--------:|:-----:|:----:|:--------------:|
| HTTP/1.1 | Yes | Yes | Yes | Yes | Yes | Yes |
| HTTP/2 | Partial | Yes | Partial | No | Yes | - |
| GraphQL | Yes | Yes | Yes | Yes | Yes | Yes |
| GraphQL subscriptions | Yes | Yes | Yes | Yes | - | - |
| WebSocket | Yes | Yes | Yes | Yes | Yes | Paid |
| Server-Sent Events | Yes | Yes | Yes | Yes | Yes | Paid |
| gRPC (all four call types) | Yes | Yes | Yes | Yes | Yes | Paid |
| gRPC reflection | Yes | Yes | - | Yes | Yes | - |

Thunder Client requires a paid plan for WebSocket, SSE, and gRPC.

In the Nouto VS Code extension and CLI, HTTPS requests negotiate HTTP/2 through ALPN when no proxy is set, and use HTTP/1.1 otherwise. The Nouto desktop app sends HTTP/1.1. Neither lets you force HTTP/2.

## Authentication

| Feature | Nouto | Postman | Insomnia | Bruno | Yaak | Thunder Client |
|---------|:-----:|:-------:|:--------:|:-----:|:----:|:--------------:|
| Basic, Bearer, and API key | Yes | Yes | Yes | Yes | Yes | Yes |
| OAuth 2.0 | Yes | Yes | Yes | Yes | Yes | Paid |
| AWS Signature V4 | Yes | Yes | Yes | Yes | Yes | Yes |
| Digest | Yes | Yes | Yes | Yes | - | - |
| NTLM | Yes | Yes | Yes | Yes | Yes | Yes |
| Auth inheritance | Yes | Yes | Partial | Yes | - | Yes |

A Nouto request can inherit auth from its folder or collection. See [Auth inheritance](/authentication/inheritance). Thunder Client's free tier doesn't include OAuth 2.0.

## Variables and environments

| Feature | Nouto | Postman | Insomnia | Bruno | Yaak | Thunder Client |
|---------|:-----:|:-------:|:--------:|:-----:|:----:|:--------------:|
| Multiple environments | Yes | Yes | Yes | Yes | Yes | Paid |
| Global variables | Yes | Yes | Yes | Yes | Yes | Paid |
| Dynamic variables | Yes | Yes | Yes | Yes | Yes | Yes |
| Collection variables | Yes | Yes | Partial | Yes | Yes | Paid |
| `.env` file linking | Yes | No | Via plugin | Yes | - | Paid |
| Secret variables | Yes | Yes | Yes | Yes | Yes | Paid |

Nouto's dynamic variables include hashes, HMAC, encoding and decoding, regex extraction, Faker data, file reads, and values you type at send time. See [Dynamic variables](/variables/dynamic-variables). Postman's dynamic variables come from the Faker library and cover about 120 values, such as names, addresses, and dates.

Nouto stores secret variable values outside your collection and environment files. The desktop app uses the OS keychain: Windows Credential Manager, macOS Keychain, or the Linux Secret Service. The VS Code extension uses VS Code's secret storage.

Thunder Client's free tier allows no environments, so the environment-based features in this table need a paid plan.

## Testing and automation

| Feature | Nouto | Postman | Insomnia | Bruno | Yaak | Thunder Client |
|---------|:-----:|:-------:|:--------:|:-----:|:----:|:--------------:|
| Pre-request scripts | Yes | Yes | Yes | Yes | No | Paid |
| Post-response scripts | Yes | Yes | Yes | Yes | No | Paid |
| No-code assertions | Yes | Partial | No | Yes | No | Yes |
| Collection runner | Yes | Yes | Yes | Yes | Partial | Paid |
| Data-driven runs | Yes | Yes | - | Paid | No | Paid |
| Benchmarking | Yes | Yes | No | No | No | No |
| Mock server | Yes | Yes | Yes | Yes | No | - |
| Monitors | No | Yes | No | No | No | - |

Nouto includes scripting, no-code assertions, a collection runner that reads CSV and JSON data files, benchmarking, and a mock server. Bruno's data-driven runs and run reports need a paid plan. Thunder Client's scripting, collection runner, and data-driven runs need a paid plan. Yaak has no scripting or assertions.

## Response

| Feature | Nouto | Postman | Insomnia | Bruno | Yaak | Thunder Client |
|---------|:-----:|:-------:|:--------:|:-----:|:----:|:--------------:|
| JSON tree viewer | Yes | Yes | Yes | Yes | Yes | Yes |
| JSONPath filter | Yes | Partial | Partial | - | Via plugin | Partial |
| Image preview | Yes | Yes | Via plugin | Yes | Yes | - |
| PDF preview | No | No | No | No | Yes | No |
| Timing breakdown | Yes | Yes | Yes | Yes | Yes | Partial |
| Response diff | Yes | Partial | No | - | Yes | - |
| Code generation | Yes (12 targets) | Yes (many) | Yes (many) | Yes (35+) | Yes (many) | Yes (10+) |

Nouto previews image responses and offers PDF responses as a file to open or save. Its response diff compares a response with the previous response to the same request. The JSONPath filter is part of the response panel, so filtering a response doesn't need a script or plugin.

## Organization

| Feature | Nouto | Postman | Insomnia | Bruno | Yaak | Thunder Client |
|---------|:-----:|:-------:|:--------:|:-----:|:----:|:--------------:|
| Nested folders | Yes | Yes | Yes | Yes | Yes | Yes |
| Drag and drop | Yes | Yes | Yes | Yes | Yes | Yes |
| Trash and recovery | Yes | Yes | - | No | - | - |
| Request history | Yes | Yes | Yes | Yes | Yes | Yes |
| Import sources | 8 | 9+ | 5 | 5 | 4 | Paid (5) |
| Export formats | 4 | 1 | 1 | 2 | 3 | Paid |

Nouto imports from Postman, Insomnia, Bruno, Hoppscotch, Thunder Client, OpenAPI, cURL, and HAR. It exports collections as Nouto JSON, Postman, HAR, and OpenAPI, and exports collection runner results as JSON, CSV, JUnit XML, and HTML.

## Editor and workflow

| Feature | Nouto | Postman | Insomnia | Bruno | Yaak | Thunder Client |
|---------|:-----:|:-------:|:--------:|:-----:|:----:|:--------------:|
| OpenAPI editor | Yes | Yes | Yes | No | No | No |
| OpenAPI linting | Yes | Yes | Yes | No | No | No |
| Command palette | Yes | Yes | Yes | - | - | Yes |
| Undo and redo | Yes | Yes | Yes | - | - | - |
| Custom shortcuts | Yes | Yes | - | Yes | - | Partial |
| Custom themes | Yes (26 built in) | Partial | Via plugins | Yes | Via plugins | Yes |

The Nouto desktop app has 26 built-in themes, a browser for 65 bundled VS Code themes, a panel for customizing the current theme, and import for VS Code theme files. The Nouto VS Code extension uses your editor's theme.

## Extensibility

| Feature | Nouto | Postman | Insomnia | Bruno | Yaak | Thunder Client |
|---------|:-----:|:-------:|:--------:|:-----:|:----:|:--------------:|
| Plugin system | No | No | Yes | Partial | Yes | No |
| Git UI | No | Yes | Yes | Partial | Yes | Paid |
| AI features | No | Yes | Yes | Yes | No | Partial |
| MCP support | No | Yes | Yes | Yes | Yes | Paid |

Nouto has no plugin system, built-in Git UI, AI features, or MCP support. In workspace storage, Nouto saves each request as its own JSON file under `.nouto/`, so you can version collections with your usual Git tools. See [Storage modes](/settings/storage-modes).

Bruno's free tier can clone a repository, pull, and view diffs from its Git UI. Committing and pushing from the Git UI need a paid plan.
