---
title: CLI
description: Run Nouto collections, benchmarks, imports, exports, and code generation from the command line.
sidebar:
  order: 0
---

The Nouto CLI lets you run API collections from the terminal for CI/CD pipelines, automated testing, and scripting workflows. It uses the same core engine as the VS Code extension and desktop app.

## Installation

```bash
npm install -g @nouto/cli
# or
pnpm add -g @nouto/cli
```

## Commands

| Command | Description |
|---------|-------------|
| `nouto run` | [Run a collection](/cli/run) with data-driven testing and report export |
| `nouto benchmark` | [Benchmark a request](/cli/benchmark) with percentile statistics |
| `nouto import` | [Import](/cli/import-export) from Postman, Insomnia, OpenAPI, HAR, cURL, and more |
| `nouto export` | [Export](/cli/import-export) to Nouto native or HAR format |
| `nouto codegen` | [Generate code](/cli/codegen) from a request across HTTP clients and TypeScript type output |

## Quick Start

Run a collection:

```bash
nouto run my-collection.nouto.json
```

Run with an environment and data file:

```bash
nouto run my-collection.nouto.json \
  --env environments.json \
  --env-name Production \
  --data test-data.csv
```

Export results as JUnit XML for CI:

```bash
nouto run my-collection.nouto.json \
  --reporter junit \
  --output results.xml
```

## Global Options

These flags are shared across `run` and `benchmark` commands:

| Option | Description |
|--------|-------------|
| `--env-var <KEY=VALUE>` | Override a variable (repeatable) |
| `--env-file <file>` | Load variables from a `.env` file |
| `--insecure` | Disable SSL certificate verification |
| `--cacert <file>` | Custom CA certificate file |
| `--proxy <url>` | HTTP/HTTPS/SOCKS5 proxy URL |
| `--noproxy` | Disable all proxy settings |
| `--verbose` | Show detailed request/response information |

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | All requests passed |
| `1` | One or more requests failed assertions or scripts |
| `2` | Collection or data file not found |
| `3` | Environment file not found or invalid |
| `4` | Invalid collection format |
| `5` | Request not found (benchmark, codegen) |
| `6` | Import format detection failed |
| `7` | Other error |

Use the exit code in CI pipelines to fail the build when API tests fail.

## Collection Files

The CLI operates on Nouto native JSON files (`.nouto.json`). Export collections from the VS Code extension or desktop app using **Export > Nouto Native**, or use `nouto import` to convert from other formats.
