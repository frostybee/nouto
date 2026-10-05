---
title: "CLI: Benchmark"
description: Send one saved request repeatedly from the Nouto CLI and report latency percentiles and requests per second.
sidebar:
  order: 2
---

The `nouto benchmark` command sends one request from a collection file many times and reports its latency statistics: minimum, maximum, mean, median, and the 90th, 95th, and 99th percentiles.

## Usage

```bash
nouto benchmark <collection-file> --request <name-or-id> [options]
```

## Options

`nouto benchmark` accepts these options:

| Option | Description | Default |
|--------|-------------|---------|
| `--request <name-or-id>` | Request to benchmark. Required. Matches the request ID first, then the name, ignoring case. | None |
| `-e, --env <file>` | Environment file to load. See [environment files](/cli/configuration#environment-files). | None |
| `-n, --env-name <name>` | Environment to activate. The match ignores case. | The environment set as `activeId` in the file, if any |
| `--env-var <KEY=VALUE...>` | Set variables. Accepts several pairs, and you can repeat the flag. | None |
| `--env-file <file>` | Load variables from a dotenv file | None |
| `-i, --iterations <n>` | Number of times to send the request | `100` |
| `-c, --concurrency <n>` | Number of requests to send at the same time | `1` |
| `--delay <ms>` | Wait between iterations, in milliseconds. Applies only when `--concurrency` is `1`. | `0` |
| `-r, --reporter <type>` | Output format: `cli` or `json` | `cli` |
| `-o, --output <file>` | File for the JSON output. Ignored with `--reporter cli`. | stdout |

`benchmark` also accepts `--insecure`, `--cacert`, `--proxy`, `--noproxy`, and `--verbose`, but it doesn't apply them. Benchmark requests always verify TLS certificates and connect without a proxy.

## How the benchmark sends the request

The benchmark sends the saved request with less processing than [`nouto run`](/cli/run):

- It resolves variables in the URL, query parameters, headers, body, and auth fields. See [variable precedence](/cli/configuration#variable-precedence).
- It applies the request's own Basic or Bearer Token auth. Other auth types and auth inherited from a folder or the collection aren't applied.
- It doesn't run scripts or assertions.
- An iteration succeeds when the response status is below 400. Connection errors and timeouts count as failures.
- Each request times out after 30 seconds.

## Example

Send the `Get Users` request 500 times, 10 at a time:

```bash
nouto benchmark api-tests.nouto.json \
  --request "Get Users" \
  --iterations 500 \
  --concurrency 10
```

The command prints a summary like this:

```text
  Benchmarking Get Users (GET https://api.example.com/users)
  Iterations: 500, Concurrency: 10

  ─────────────────────────────────
  Results:     498 passed, 2 failed
  Total:       12.34s
  RPS:         40.5 req/s

  Min:         18ms
  Max:         342ms
  Mean:        24.7ms
  Median:      22ms
  p90:         31ms
  p95:         45ms
  p99:         198ms
```

`Total` is the wall-clock time of the whole benchmark, and `RPS` is the number of iterations divided by that time. The latency statistics include failed iterations.

## Concurrency

With `--concurrency 1`, the benchmark sends one request at a time, which measures latency without contention.

With a higher value, the benchmark sends the iterations in batches of that size. It waits for every request in a batch to finish before it starts the next batch, so one slow response holds up the whole batch.

## JSON output

Use `--reporter json` with `--output` to save the results for a dashboard or a CI job:

```bash
nouto benchmark api-tests.nouto.json \
  --request "Get Users" \
  --reporter json \
  --output benchmark-results.json
```

The JSON object has these fields:

| Field | Content |
|-------|---------|
| `requestName`, `method`, `url` | The request, with variables resolved in `url` |
| `config` | The `iterations`, `concurrency`, and `delayBetweenMs` values used |
| `startedAt`, `completedAt` | ISO 8601 timestamps |
| `statistics` | `totalIterations`, `successCount`, `failCount`, `min`, `max`, `mean`, `median`, `p50`, `p75`, `p90`, `p95`, `p99`, `totalDuration`, and `requestsPerSecond` |
| `iterations` | One entry per iteration with its status, duration, size, success flag, and error |
| `distribution` | Iteration counts in up to 10 duration buckets |

Without `--output`, the JSON goes to stdout after two header lines, so the output as a whole isn't valid JSON. Pass `--output` when another tool reads the result.

## Exit codes

`nouto benchmark` exits with `1` when at least one iteration fails, and with `5` when no request matches `--request`. [Exit codes](/cli/#exit-codes) lists the other codes.
