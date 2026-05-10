---
title: "CLI: Benchmark"
description: Benchmark a single request with configurable iterations and concurrency from the Nouto CLI.
sidebar:
  order: 2
---

The `nouto benchmark` command runs a single request multiple times and reports latency statistics.

## Usage

```bash
nouto benchmark <collection-file> --request <name-or-id> [options]
```

## Options

| Option | Description | Default |
|--------|-------------|---------|
| `--request <name-or-id>` | Request name or ID (required) | |
| `-e, --env <file>` | Environment file | None |
| `-n, --env-name <name>` | Environment to activate | First in file |
| `--env-var <KEY=VALUE>` | Override a variable (repeatable) | None |
| `--env-file <file>` | Load variables from `.env` file | None |
| `-i, --iterations <n>` | Number of iterations | 100 |
| `-c, --concurrency <n>` | Concurrent requests | 1 |
| `--delay <ms>` | Delay between iterations | 0 |
| `-r, --reporter <type>` | Output: `cli` or `json` | `cli` |
| `-o, --output <file>` | Write report to file | stdout |
| `--insecure` | Disable SSL certificate verification | Off |
| `--cacert <file>` | Custom CA certificate file path | None |
| `--proxy <url>` | HTTP/HTTPS/SOCKS5 proxy URL | None |
| `--noproxy` | Disable all proxy settings | Off |
| `--verbose` | Show detailed request/response information | Off |

## Example

```bash
nouto benchmark api-tests.nouto.json \
  --request "Get Users" \
  --iterations 500 \
  --concurrency 10
```

## CLI Output

```
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

## JSON Output

Use `--reporter json` to get machine-readable output for dashboards or CI integration:

```bash
nouto benchmark api-tests.nouto.json \
  --request "Get Users" \
  --reporter json \
  --output benchmark-results.json
```

The JSON output includes the full statistics object: min, max, mean, median, all percentiles, RPS, success/fail counts, total duration, and per-iteration results.

## Concurrency

Set `--concurrency` to simulate multiple simultaneous clients. With concurrency > 1, Nouto sends multiple requests in parallel and measures throughput under load.

Sequential mode (`--concurrency 1`) is useful for measuring baseline latency without contention.

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | All iterations passed |
| `1` | One or more iterations failed |
| `2` | Collection file not found |
| `3` | Environment not found |
| `5` | Request not found |
| `7` | Other error |
