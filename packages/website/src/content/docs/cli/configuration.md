---
title: "CLI: Configuration"
description: Configure environments, variables, TLS certificates, proxies, and cookies for the Nouto CLI.
sidebar:
  order: 6
---

This page explains the environment, variable, TLS, proxy, and cookie options of [`nouto run`](/cli/run), and which of them [`nouto benchmark`](/cli/benchmark) applies.

## Environment files

Pass an environment file with `--env` and choose an environment with `--env-name`:

```bash
nouto run collection.nouto.json \
  --env environments.json \
  --env-name Production
```

The CLI reads a JSON object with an `environments` array and optional `globalVariables` and `activeId` fields. To create one, click the **Export all environments** button in the Environments panel. A file from a single-environment export doesn't work with the CLI and fails with exit code `3`.

The export from the VS Code extension includes your global variables, and it keeps the names of [secret variables](/variables/secrets) but leaves their values empty. Supply those values as described in [variable precedence](#variable-precedence). The export from the desktop app doesn't include global variables.

Without `--env-name`, the CLI activates the environment whose ID matches `activeId`. Files from **Export all environments** have no `activeId`, so no environment is active unless you pass `--env-name`.

## Dotenv files

Load variables from a dotenv file with `--env-file`:

```bash
nouto run collection.nouto.json --env-file .env.local
```

The file uses one `KEY=VALUE` pair per line:

```text title=".env.local"
BASE_URL=https://api.example.com
API_KEY=example-key
# Lines that start with # are comments
DB_HOST="localhost"
```

The CLI strips one pair of matching single or double quotes around a value. It skips blank lines and lines without `=`. It doesn't expand variables or strip comments that follow a value on the same line.

## Variables from the command line

Set variables with `--env-var`:

```bash
nouto run collection.nouto.json \
  --env-var baseUrl=https://staging.example.com token=$API_TOKEN
```

`--env-var` takes several pairs and you can repeat the flag. When an environment is active, the CLI adds the pairs to that environment. Otherwise, it adds them to the global variables. A pair only takes effect for a name that no earlier source in the precedence order defines.

## Variable precedence

When several sources define the same variable, the CLI uses the first match in this order. The order differs between `run` and `benchmark`.

For `nouto run`:

1. Variables from the `--env-file` dotenv file.
2. Global variables from the environment file. Values from the current data file row replace globals of the same name. `--env-var` pairs come next when no environment is active.
3. Collection variables. Folder variables aren't applied.
4. Variables of the active environment, followed by `--env-var` pairs.

For `nouto benchmark`:

1. Collection variables and the variables of the folders that contain the request.
2. Variables from the `--env-file` dotenv file.
3. Global variables from the environment file, followed by `--env-var` pairs when no environment is active.
4. Variables of the active environment, followed by `--env-var` pairs.

Dynamic variables such as `{{$uuid.v4}}` resolve before any of these sources. In `nouto run`, response references such as `{{$response.body.id}}` and `{{Login.$response.body.token}}` also resolve first.

Because `--env-var` pairs come last, a pair has no effect on a variable that the collection, the global variables, or the active environment already define, even with an empty value. This includes the empty secret variables in an export from the VS Code extension. To supply a secret from the command line, remove the variable from the environment file, or put it in a dotenv file and pass it with `--env-file`.

In `nouto run`, a script that calls `nt.setVar()` stores the value in the active environment, or in the global variables when you pass `'global'` as the scope. When no environment is active, a value set with the default scope isn't stored, so pass `'global'`. A stored value follows the same precedence for later requests in the iteration.

## TLS certificates

`nouto run` has three TLS options. `nouto benchmark` accepts `--insecure` and `--cacert` but doesn't apply them.

Skip certificate verification for a server with a self-signed or internal certificate:

```bash
nouto run collection.nouto.json --insecure
```

Trust a custom CA certificate:

```bash
nouto run collection.nouto.json --cacert /path/to/ca.pem
```

For mutual TLS, pass a JSON file that points to the client certificate and key:

```bash
nouto run collection.nouto.json --client-cert-config certs.json
```

```json title="certs.json"
{
  "cert": "./client-cert.pem",
  "key": "./client-key.pem",
  "passphrase": "example-passphrase"
}
```

The CLI resolves `cert` and `key` relative to the directory that contains the config file. `passphrase` is optional.

## Proxy

`nouto run` sends requests through a proxy when you pass `--proxy` or set a proxy environment variable. `nouto benchmark` accepts `--proxy` and `--noproxy` but always connects directly.

Pass the proxy URL, including the port:

```bash
nouto run collection.nouto.json --proxy http://proxy.example.com:8080
nouto run collection.nouto.json --proxy socks5://user:pass@proxy.example.com:1080
```

The CLI supports `http://`, `https://`, and `socks5://` proxy URLs.

Without `--proxy`, the CLI uses the first of these environment variables that is set: `HTTPS_PROXY`, `https_proxy`, `HTTP_PROXY`, `http_proxy`. It sends both HTTP and HTTPS requests through that proxy.

`NO_PROXY` or `no_proxy` lists hosts that bypass the proxy, separated by commas. The entry `example.com` matches `example.com` and its subdomains, `.example.com` matches only the subdomains, and `*` matches every host. IP ranges in CIDR notation aren't supported.

To ignore `--proxy` and the proxy environment variables, pass `--noproxy`:

```bash
nouto run collection.nouto.json --noproxy
```

A proxy saved on a request in the collection still applies with `--noproxy`.

## Cookies

During a run, the CLI stores cookies from `Set-Cookie` response headers in memory and sends them with later requests to the same domain or its subdomains. The cookies last until the run ends.

To turn this off:

```bash
nouto run collection.nouto.json --disable-cookies
```

`nouto benchmark` doesn't store or send cookies.
