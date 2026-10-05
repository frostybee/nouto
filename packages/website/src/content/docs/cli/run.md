---
title: "CLI: Run"
description: Run a Nouto collection from the command line with data files, tag filters, and JSON, JUnit, HTML, or CSV reports.
sidebar:
  order: 1
---

The `nouto run` command sends every HTTP request in a collection file, evaluates assertions and script tests, and exits with code `1` if any request fails. Use it to run API tests locally or in a CI pipeline.

## Usage

```bash
nouto run <collection-file> [options]
```

## Options

`nouto run` accepts these options:

| Option | Description | Default |
|--------|-------------|---------|
| `-e, --env <file>` | Environment file to load. See [environment files](/cli/configuration#environment-files). | None |
| `-n, --env-name <name>` | Environment to activate. The match ignores case. | The environment set as `activeId` in the file, if any |
| `--env-var <KEY=VALUE...>` | Set variables. Accepts several pairs, and you can repeat the flag. | None |
| `--env-file <file>` | Load variables from a dotenv file | None |
| `--folder <name-or-id>` | Run only the requests in this folder and its subfolders. Matches the folder ID first, then the exact name. | Whole collection |
| `--tags <tags>` | Run only requests that have every listed tag (comma-separated) | None |
| `--exclude-tags <tags>` | Skip requests that have any listed tag (comma-separated) | None |
| `-d, --data <file>` | CSV or JSON data file. The file extension must be `.csv` or `.json`. | None |
| `-i, --iterations <n>` | Number of iterations. With `--data`, the number of data rows to use, where `0` uses every row. | `1` |
| `--delay <ms>` | Wait between requests, in milliseconds | `0` |
| `--timeout <ms>` | Per-request timeout, in milliseconds. A timeout saved on the request takes precedence. | `30000` |
| `--stop-on-failure` | Stop the run at the first failed request | Off |
| `--parallel` | Send the requests in each iteration at the same time | Off |
| `-r, --reporter <type>` | Report format: `cli`, `json`, `junit`, `html`, or `csv` | `cli` |
| `-o, --output <file>` | File for the `--reporter` output. Ignored with `--reporter cli`. | stdout |
| `--reporter-json <file>` | Also write a JSON report to this file | None |
| `--reporter-junit <file>` | Also write a JUnit XML report to this file | None |
| `--reporter-html <file>` | Also write an HTML report to this file | None |
| `--reporter-skip-headers` | Leave response headers out of reports | Off |
| `--reporter-skip-response-body` | Leave response bodies out of reports | Off |
| `--reporter-skip-body` | Same as `--reporter-skip-response-body` | Off |
| `--reporter-skip-request-body` | No effect. Reports don't include request bodies. | Off |
| `--silent` | Print nothing to the terminal except errors and stdout reports | Off |
| `--verbose` | Print each request's URL, response headers, and the first 500 characters of its response body | Off |
| `--insecure` | Skip TLS certificate verification | Off |
| `--cacert <file>` | Trust this CA certificate | None |
| `--client-cert-config <file>` | JSON file that points to a client certificate and key for mutual TLS | None |
| `--proxy <url>` | Send requests through an HTTP, HTTPS, or SOCKS5 proxy | None |
| `--noproxy` | Ignore `--proxy` and the proxy environment variables | Off |
| `--disable-cookies` | Don't store cookies from responses or send them with later requests | Off |

`--env-var` accepts several pairs, so it consumes every argument after it that doesn't start with `-`. Put the collection file before `--env-var`.

[CLI: Configuration](/cli/configuration) explains the TLS, proxy, cookie, and variable options in detail.

## Pass and fail rules

A request fails when any of these is true:

- An enabled assertion fails. Assertions set on the collection and its folders apply to the requests they contain.
- An `nt.test()` call in a script fails.
- The request doesn't complete, for example because of a connection error or a timeout.
- The request has no enabled assertions and the response status is 400 or higher.

The run exits with `1` when at least one request fails. [Exit codes](/cli/#exit-codes) lists the other codes.

### Requests the runner skips

The runner sends HTTP requests only. It skips gRPC, WebSocket, SSE, and GraphQL subscription requests. The terminal output lists a skipped request as `FAIL` with the reason, the summary counts it under **Skipped**, and JUnit XML reports record it as an `<error>`. Skipped requests don't change the exit code.

## What the CLI applies to each request

The CLI uses these settings from the collection file:

- The request's URL, query parameters, headers, and body. Body content is sent for `POST`, `PUT`, and `PATCH` requests only.
- Pre-request and post-response scripts set on the collection, its folders, and the request, in sequential runs.
- Assertions set on the collection, its folders, and the request.
- Collection variables. Folder variables aren't applied.

The CLI applies the auth configured on the request itself for Basic, Bearer Token, and API Key. For OAuth 2.0, it sends a token only when the active environment in the environment file already stores one for that configuration. It refreshes an expired token when a refresh token is stored, but it doesn't run OAuth flows. It doesn't apply AWS Signature v4, Digest, or NTLM auth, and it doesn't apply auth or headers inherited from a folder or the collection.

## Iterations and data files

Without a data file, `--iterations` repeats the whole collection. Each iteration runs every selected request.

With `--data`, each row of the data file becomes a set of variables for one iteration. The run uses as many rows as `--iterations` allows, starting from the first row. Because `--iterations` defaults to `1`, pass `--iterations 0` to use every row:

```bash
nouto run api-tests.nouto.json --data users.csv --iterations 0
```

[Data-driven testing](/testing/collection-runner/#data-driven-testing) describes the CSV and JSON data file formats.

## Sequential and parallel runs

By default, the CLI sends requests one at a time, in collection order:

- `--delay` waits between requests.
- A script can call `nt.setNextRequest()` to jump to another request by name or ID. See [flow control](/testing/collection-runner/#flow-control).
- If the run reaches the same request a third time in one iteration, the CLI stops the run to break the loop.
- `--stop-on-failure` stops the run, including any remaining iterations, at the first failed request.

With `--parallel`, the CLI sends all requests in an iteration at the same time and waits for them before it starts the next iteration. Scripts don't run in parallel mode, so `nt.test()` checks, `nt.setNextRequest()`, and variables set by scripts have no effect. `--delay` and `--stop-on-failure` also have no effect.

## Reports

The `cli` reporter prints progress and a summary to the terminal. The other formats produce a report:

| Format | Content |
|--------|---------|
| `json` | Collection name, summary counts, and every result with its status, duration, size, assertion results, script test results, response headers, and response body |
| `junit` | One `<testsuite>` for the run and one `<testcase>` per request. Failed assertions and script tests appear as `<failure>`, request errors as `<error>`. |
| `html` | A single HTML file with a summary and a results table. Rows with an error, assertions, or script tests have an expandable details section. |
| `csv` | One row per result with the name, method, URL, status, duration, pass or fail, and error |

`--reporter` writes one report to `--output`, or to stdout when you omit `--output`. When `--reporter` is set to anything other than `cli`, the terminal progress and summary don't appear. To keep the terminal output and also write files, leave `--reporter` at `cli` and use the `--reporter-json`, `--reporter-junit`, and `--reporter-html` flags. You can combine them:

```bash
nouto run api-tests.nouto.json \
  --reporter-json results.json \
  --reporter-junit results.xml \
  --reporter-html report.html
```

There's no `--reporter-csv` flag. Use `--reporter csv` to write CSV.

### Sensitive values in reports

Reports mask the values of the `Authorization`, `Cookie`, `Set-Cookie`, `Proxy-Authorization`, `X-API-Key`, and `X-Auth-Token` response headers, and of any header whose value looks like a Bearer token, Basic credentials, or a JWT. A masked value keeps its first and last four characters, or becomes `***` when it has eight characters or fewer. Response bodies aren't masked. To leave them out of a report, pass `--reporter-skip-response-body`.

## Examples

These examples cover common combinations of options.

### Run with an environment

```bash
nouto run api-tests.nouto.json \
  --env environments.json \
  --env-name Staging
```

### Run one folder

```bash
nouto run api-tests.nouto.json --folder "Auth Tests"
```

### Filter by tag

```bash
nouto run api-tests.nouto.json --tags smoke
nouto run api-tests.nouto.json --exclude-tags slow,experimental
```

### Set variables from the command line

```bash
nouto run api-tests.nouto.json \
  --env-var baseUrl=https://staging.example.com token=$API_TOKEN
```

`--env-var` doesn't replace a variable that another source already defines. See [variable precedence](/cli/configuration#variable-precedence).

### Write an HTML report

```bash
nouto run api-tests.nouto.json \
  --reporter html \
  --output report.html
```

### Stop at the first failure and write JUnit XML

```bash
nouto run api-tests.nouto.json \
  --reporter-junit test-results.xml \
  --stop-on-failure
```

### Use a proxy and skip certificate checks

```bash
nouto run api-tests.nouto.json \
  --insecure \
  --proxy http://proxy.example.com:8080
```

[CLI: CI/CD integration](/cli/ci-cd) has complete pipeline examples for GitHub Actions, GitLab CI, Jenkins, and Azure DevOps.
