---
title: "CLI: Configuration"
description: Configure SSL, proxy, cookies, environment files, and variable overrides for the Nouto CLI.
sidebar:
  order: 6
---

This page covers configuration options shared across `nouto run` and `nouto benchmark`.

## SSL / TLS

### Disable certificate verification

Skip SSL certificate validation for self-signed or internal certificates:

```bash
nouto run collection.nouto.json --insecure
```

### Custom CA certificate

Provide a custom CA certificate file:

```bash
nouto run collection.nouto.json --cacert /path/to/ca.pem
```

### Client certificates (mTLS)

For mutual TLS authentication, provide a JSON config file:

```bash
nouto run collection.nouto.json --client-cert-config certs.json
```

The config file format:

```json
{
  "cert": "./client-cert.pem",
  "key": "./client-key.pem",
  "passphrase": "optional-passphrase"
}
```

Paths in the config file are resolved relative to the config file's directory.

## Proxy

### Explicit proxy

```bash
nouto run collection.nouto.json --proxy http://proxy.corp:8080
nouto run collection.nouto.json --proxy socks5://user:pass@proxy:1080
```

### Environment variable proxy

If no `--proxy` flag is set, the CLI checks these environment variables in order:

1. `HTTPS_PROXY` / `https_proxy`
2. `HTTP_PROXY` / `http_proxy`

The `NO_PROXY` / `no_proxy` variable specifies hostnames or CIDRs that bypass the proxy.

### Disable proxy

Force direct connections even when proxy environment variables are set:

```bash
nouto run collection.nouto.json --noproxy
```

## Cookies

The CLI automatically handles cookies within a run session (in-memory, not persisted). Cookies received via `Set-Cookie` headers are stored and sent with subsequent requests to matching domains.

To disable automatic cookie handling:

```bash
nouto run collection.nouto.json --disable-cookies
```

## Environment Files

### Nouto environment file

Load a Nouto environment JSON file exported from the VS Code extension or desktop app:

```bash
nouto run collection.nouto.json \
  --env environments.json \
  --env-name Production
```

### .env file

Load variables from a dotenv-format file:

```bash
nouto run collection.nouto.json --env-file .env.local
```

The `.env` file uses standard `KEY=VALUE` format:

```
BASE_URL=https://api.example.com
API_KEY=sk-test-12345
# Comments are supported
DB_HOST="localhost"
```

## Variable Overrides

Override individual variables from the command line:

```bash
nouto run collection.nouto.json \
  --env-var baseUrl=https://staging.api.com \
  --env-var token=$API_TOKEN
```

`--env-var` has the highest priority and overrides all other variable sources.

### Priority order

Variables are resolved in this order (highest to lowest):

1. `--env-var` overrides
2. Data file row
3. Active environment variables
4. Collection/folder variables
5. Global variables
6. `.env` file variables (`--env-file`)
7. Dynamic variables (`{{$uuid.v4}}`, `{{$timestamp.iso}}`, etc.)

## Tags

Filter which requests run using tags (tags are set on requests in the collection):

```bash
# Only run requests tagged with ALL specified tags (AND logic)
nouto run collection.nouto.json --tags smoke

# Skip requests tagged with ANY specified tag (OR logic)
nouto run collection.nouto.json --exclude-tags slow,experimental

# Combine both
nouto run collection.nouto.json --tags regression --exclude-tags flaky
```

## Reporter Options

### Multiple reporters

Generate multiple report formats in a single run:

```bash
nouto run collection.nouto.json \
  --reporter-json results.json \
  --reporter-junit results.xml \
  --reporter-html report.html
```

The CLI reporter always runs unless `--silent` is set.

### Strip sensitive data from reports

```bash
nouto run collection.nouto.json \
  --reporter-json results.json \
  --reporter-skip-headers \
  --reporter-skip-body
```

| Flag | Effect |
|------|--------|
| `--reporter-skip-headers` | Omit request and response headers |
| `--reporter-skip-request-body` | Omit request bodies |
| `--reporter-skip-response-body` | Omit response bodies |
| `--reporter-skip-body` | Omit both request and response bodies |
