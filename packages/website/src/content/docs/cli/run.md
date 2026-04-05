---
title: "CLI: Run"
description: Run a Nouto collection from the command line with data-driven testing, flow control, and CI-compatible report export.
sidebar:
  order: 1
---

The `nouto run` command executes all requests in a collection sequentially and reports the results.

## Usage

```bash
nouto run <collection-file> [options]
```

## Options

| Option | Description | Default |
|--------|-------------|---------|
| `-e, --env <file>` | Environment file (Nouto JSON) | None |
| `-n, --env-name <name>` | Environment to activate by name | First in file |
| `--folder <name-or-id>` | Run only a specific folder | Entire collection |
| `-d, --data <file>` | CSV or JSON data file for iterations | None |
| `-i, --iterations <n>` | Number of iterations | 1 |
| `--delay <ms>` | Delay between requests | 0 |
| `--timeout <ms>` | Per-request timeout | 30000 |
| `--stop-on-failure` | Stop on first failure | Off |
| `-r, --reporter <type>` | Output format: `cli`, `json`, `junit`, `html` | `cli` |
| `-o, --output <file>` | Write report to file (stdout if omitted) | stdout |
| `--silent` | Suppress progress output | Off |

## Examples

### Basic run

```bash
nouto run api-tests.nouto.json
```

### With environment

```bash
nouto run api-tests.nouto.json \
  --env environments.json \
  --env-name Staging
```

### Data-driven testing with CSV

```bash
nouto run api-tests.nouto.json \
  --data users.csv \
  --iterations 3
```

### JUnit XML for CI/CD

```bash
nouto run api-tests.nouto.json \
  --reporter junit \
  --output test-results.xml \
  --stop-on-failure
```

### HTML report

```bash
nouto run api-tests.nouto.json \
  --reporter html \
  --output report.html
```

### Run a specific folder

```bash
nouto run api-tests.nouto.json --folder "Auth Tests"
```

## Reporter Formats

| Format | Description |
|--------|-------------|
| `cli` | Color-coded terminal output with progress and summary |
| `json` | Full structured JSON with per-request details and assertions |
| `junit` | JUnit XML compatible with Jenkins, GitHub Actions, GitLab CI, Azure DevOps |
| `html` | Self-contained HTML report with summary and expandable request details |

## Variable Resolution

The CLI resolves variables in the same order as the GUI:

1. Data file row (highest priority)
2. Active environment
3. Global variables
4. Collection/folder variables
5. Dynamic variables (`{{$uuid.v4}}`, `{{$timestamp.iso}}`, etc.)

Scripts (`nt.setVar()`) update the environment between requests, enabling response chaining.

## Exit Code

The process exits with code `1` if any request fails, and `0` if all pass.
