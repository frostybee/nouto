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
```

## Commands

| Command | Description |
|---------|-------------|
| `nouto run` | [Run a collection](/cli/run) with data-driven testing and report export |
| `nouto benchmark` | [Benchmark a request](/cli/benchmark) with percentile statistics |
| `nouto import` | [Import](/cli/import-export) from Postman, Insomnia, OpenAPI, HAR, cURL, and more |
| `nouto export` | [Export](/cli/import-export) to Nouto native or HAR format |
| `nouto codegen` | [Generate code](/cli/codegen) from a request in 11 languages |

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

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | All requests passed |
| `1` | One or more requests failed |

Use the exit code in CI pipelines to fail the build when API tests fail.

## Collection Files

The CLI operates on Nouto native JSON files (`.nouto.json`). Export collections from the VS Code extension or desktop app using **Export > Nouto Native**, or use `nouto import` to convert from other formats.
