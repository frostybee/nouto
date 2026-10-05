---
title: CLI
description: Run Nouto collections, benchmarks, imports, exports, and code generation from the command line.
sidebar:
  order: 0
---

The Nouto CLI runs collections from a terminal or a CI pipeline. It reads collection files exported from the VS Code extension or the desktop app, sends the requests, checks assertions and script tests, and sets its exit code so a pipeline can fail the build when a request fails.

## Installation

The CLI isn't published to npm. Build it from the Nouto repository with Git, Node.js, and [pnpm](https://pnpm.io/installation). The built CLI runs on Node.js 18 or later.

```bash
git clone https://github.com/frostybee/nouto.git
cd nouto
pnpm install --filter "@nouto/cli..."
pnpm run build:core
pnpm run build:cli
node packages/cli/dist/bin/cli.js --help
```

The `--filter "@nouto/cli..."` flag installs only the CLI and the packages it depends on. The CLI depends on `@nouto/core`, so build core before the CLI.

The examples in these pages use `nouto` as the command name. From a source checkout, replace `nouto` with `node packages/cli/dist/bin/cli.js`.

## Commands

The CLI has five commands:

| Command | Purpose |
|---------|---------|
| [`nouto run`](/cli/run) | Run every HTTP request in a collection and report the results |
| [`nouto benchmark`](/cli/benchmark) | Send one request repeatedly and report latency percentiles |
| [`nouto import`](/cli/import-export) | Convert a Postman, Insomnia, Hoppscotch, Thunder Client, HAR, Bruno, OpenAPI, or cURL file to a Nouto collection |
| [`nouto export`](/cli/import-export) | Convert a Nouto collection file to Nouto format or HAR |
| [`nouto codegen`](/cli/codegen) | Generate a code snippet for a saved request |

Run `nouto <command> --help` to print the options for a command.

## Run a collection

Run every request in a collection file:

```bash
nouto run my-collection.nouto.json
```

Run with an environment, using every row of a CSV data file:

```bash
nouto run my-collection.nouto.json \
  --env environments.json \
  --env-name Production \
  --data test-data.csv \
  --iterations 0
```

Write the results as JUnit XML for a CI server:

```bash
nouto run my-collection.nouto.json \
  --reporter junit \
  --output results.xml
```

[CLI: Configuration](/cli/configuration) covers the TLS, proxy, cookie, and variable options, and the order in which the CLI resolves variables.

## Collection files

Every command except `import` reads a Nouto collection file. To create one, right-click a collection in the sidebar and choose **Export** > **Nouto Collection**, or convert a file from another tool with [`nouto import`](/cli/import-export).

The CLI accepts three JSON shapes:

- A single-collection export, as written by **Export** > **Nouto Collection** or `nouto import`.
- A multi-collection export. The CLI reads only the first collection in the file.
- A raw collection object with `id`, `name`, and `items` fields.

## Exit codes

All commands use the same exit codes:

| Code | Meaning |
|------|---------|
| `0` | The command succeeded. For `run`, every request passed. For `benchmark`, every iteration succeeded. |
| `1` | For `run`, at least one request failed. For `benchmark`, at least one iteration failed. The CLI also exits with `1` for invalid usage, such as a missing argument. |
| `2` | A file the command needs is missing: the collection file, the `import` input file, the `.env` file, the CA certificate, or the client certificate config. `run` also exits with `2` when the data file has no rows. |
| `3` | The environment file is missing, isn't valid JSON, has no `environments` array, or has no environment matching `--env-name`. |
| `4` | The collection file isn't valid JSON or isn't a Nouto collection, or `run` found no requests to execute, for example because `--tags` matched nothing. |
| `5` | `benchmark` or `codegen` found no request matching `--request`. |
| `6` | `import` couldn't detect the input format. Pass `--from` to set it. |
| `7` | Any other error, such as a `--folder` that matches no folder, a missing data file or one that isn't `.csv` or `.json`, a malformed `--env-var` pair, a missing `codegen` option, or an unsupported `--from` or `--to` value. |
