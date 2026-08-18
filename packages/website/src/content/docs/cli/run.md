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
| `--env-var <KEY=VALUE>` | Override a variable (repeatable) | None |
| `--env-file <file>` | Load variables from `.env` file | None |
| `--folder <name-or-id>` | Run only a specific folder | Entire collection |
| `-d, --data <file>` | CSV or JSON data file for iterations | None |
| `-i, --iterations <n>` | Number of iterations | 1 |
| `--delay <ms>` | Delay between requests | 0 |
| `--timeout <ms>` | Per-request timeout | 30000 |
| `--stop-on-failure` | Stop on first failure | Off |
| `--parallel` | Run requests concurrently | Off |
| `-r, --reporter <type>` | Output format: `cli`, `json`, `junit`, `html` | `cli` |
| `-o, --output <file>` | Write report to file (stdout if omitted) | stdout |
| `--reporter-json <file>` | Generate JSON report at path | None |
| `--reporter-junit <file>` | Generate JUnit XML report at path | None |
| `--reporter-html <file>` | Generate HTML report at path | None |
| `--reporter-skip-headers` | Omit headers from reports | Off |
| `--reporter-skip-request-body` | Omit request bodies from reports | Off |
| `--reporter-skip-response-body` | Omit response bodies from reports | Off |
| `--reporter-skip-body` | Omit both request and response bodies | Off |
| `--silent` | Suppress progress output | Off |
| `--verbose` | Show detailed request/response information | Off |
| `--insecure` | Disable SSL certificate verification | Off |
| `--cacert <file>` | Custom CA certificate file path | None |
| `--client-cert-config <file>` | Client certificate config JSON for mTLS | None |
| `--proxy <url>` | HTTP/HTTPS/SOCKS5 proxy URL | None |
| `--noproxy` | Disable all proxy settings | Off |
| `--disable-cookies` | Do not automatically handle cookies | Off |
| `--tags <tags>` | Only run requests with ALL specified tags (comma-separated) | None |
| `--exclude-tags <tags>` | Skip requests with ANY specified tags (comma-separated) | None |

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

### Variable override

```bash
nouto run api-tests.nouto.json \
  --env-var baseUrl=https://staging.api.com \
  --env-var token=$API_TOKEN
```

### SSL and proxy

```bash
nouto run api-tests.nouto.json \
  --insecure \
  --proxy http://proxy.corp:8080
```

### Client certificate (mTLS)

```bash
nouto run api-tests.nouto.json \
  --client-cert-config certs.json
```

Where `certs.json` contains:

```json
{
  "cert": "./client.pem",
  "key": "./client-key.pem",
  "passphrase": "optional"
}
```

### Parallel execution

```bash
nouto run api-tests.nouto.json --parallel
```

### Multiple reporters

```bash
nouto run api-tests.nouto.json \
  --reporter-json results.json \
  --reporter-junit results.xml \
  --reporter-html report.html
```

### Tag filtering

```bash
nouto run api-tests.nouto.json --tags smoke
nouto run api-tests.nouto.json --exclude-tags slow,experimental
```

### GitHub Actions CI

```yaml
- name: Run API tests
  run: |
    pnpm install --frozen-lockfile
    pnpm run build:cli
    node packages/cli/dist/bin/cli.js run tests/api-tests.nouto.json \
      --env tests/environments.json \
      --env-name CI \
      --env-var token=${{ secrets.API_TOKEN }} \
      --reporter-junit results.xml \
      --stop-on-failure

- name: Upload test results
  if: always()
  uses: actions/upload-artifact@v4
  with:
    name: api-test-results
    path: results.xml
```

## Reporter Formats

| Format | Description |
|--------|-------------|
| `cli` | Color-coded terminal output with progress and summary |
| `json` | Full structured JSON with per-request details and assertions |
| `junit` | JUnit XML compatible with Jenkins, GitHub Actions, GitLab CI, Azure DevOps |
| `html` | Self-contained HTML report with summary and expandable request details |

## Variable Resolution

The CLI resolves variables with the following priority (highest to lowest):

1. `--env-var` overrides
2. Data file row
3. Active environment variables
4. Collection/folder variables
5. Global variables
6. `.env` file variables (`--env-file`)
7. Dynamic variables (`{{$uuid.v4}}`, `{{$timestamp.iso}}`, etc.)

Scripts (`nt.setVar()`) update the environment between requests, enabling response chaining.

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | All requests passed |
| `1` | One or more requests failed assertions or scripts |
| `2` | Collection or data file not found |
| `3` | Environment file not found or invalid |
| `4` | Invalid collection format |
| `7` | Other error |
