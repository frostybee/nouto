---
title: "CLI: Import and export"
description: Convert Postman, Insomnia, Hoppscotch, Thunder Client, HAR, Bruno, OpenAPI, and cURL files to Nouto collections, and export collections to HAR, with the Nouto CLI.
sidebar:
  order: 3
---

The `nouto import` command converts a file from another API tool into a Nouto collection file that [`nouto run`](/cli/run) can execute. The `nouto export` command converts a Nouto collection file to HAR or rewrites it in Nouto format.

## Import a file

```bash
nouto import <file> [options]
```

`nouto import` accepts these options:

| Option | Description | Default |
|--------|-------------|---------|
| `--from <format>` | Source format. See the table below. | Detected from the file |
| `-o, --output <file>` | Output file | `<collection-name>.nouto.json` in the current directory |

The default file name is the collection name in lowercase, with every character other than letters, digits, `-`, and `_` replaced by `_`. For example, a collection named `My API` becomes `my_api.nouto.json`.

### Supported formats

Pass one of these values to `--from`, or let the CLI detect the format:

| Format | `--from` value | Detected when |
|--------|----------------|---------------|
| Postman | `postman` | The JSON has `info.schema` containing `postman`, or `info._postman_id` |
| Insomnia | `insomnia` | The JSON has `_type: "export"` or `__export_format` |
| Hoppscotch | `hoppscotch` | The JSON is an array whose first item has `v` and `name` |
| Thunder Client | `thunder-client` | The JSON is an array whose first item has `containerId` |
| HAR | `har` | The JSON has `log.version` and `log.entries` |
| OpenAPI or Swagger | `openapi` | The JSON has an `openapi` or `swagger` field, or the file extension is `.yaml` or `.yml` |
| Bruno | `bruno` | The file extension is `.bru` |
| cURL | `curl` | The file content starts with `curl ` |

A Bruno import reads a single `.bru` file and creates a collection named `Bruno Import` with one request. A cURL import creates a collection named `Imported from cURL` with one request.

Insomnia, Hoppscotch, and Thunder Client exports can contain several collections. The CLI writes each one to its own `<collection-name>.nouto.json` file. If you pass `--output`, each collection overwrites the same file and only the last one remains, so leave `--output` out for these files.

### Import examples

Detect the format:

```bash
nouto import postman-collection.json
```

Set the format explicitly:

```bash
nouto import spec.yaml --from openapi
```

Choose the output file:

```bash
nouto import postman-collection.json --output my-api.nouto.json
```

## Export a collection

```bash
nouto export <collection-file> [options]
```

`nouto export` accepts these options:

| Option | Description | Default |
|--------|-------------|---------|
| `--to <format>` | Target format: `nouto` or `har` | `nouto` |
| `-o, --output <file>` | Output file | `<collection-name>.nouto.json` or `<collection-name>.har` in the current directory |

A HAR export contains one entry per request, with folders flattened. A Nouto export rewrites the collection in the single-collection export format, which is useful for extracting the first collection from a multi-collection export file.

:::caution
Without `--output`, `nouto export` writes to a file named after the collection. If that name matches the input file, for example when you export `my_api.nouto.json` for a collection named `My API` in Nouto format, the command overwrites the input file.
:::

### Export examples

Export as HAR:

```bash
nouto export my-api.nouto.json --to har --output traffic.har
```

Rewrite a collection file in Nouto format:

```bash
nouto export my-api.nouto.json --output my-api-clean.nouto.json
```

## Convert a Postman collection and run it

Import the Postman file, then run the result:

```bash
nouto import postman-collection.json --output my-api.nouto.json
nouto run my-api.nouto.json --reporter junit --output results.xml
```

## Exit codes

`nouto import` exits with `2` when the input file is missing and with `6` when it can't detect the format. Both commands exit with `7` for an unsupported `--from` or `--to` value. [Exit codes](/cli/#exit-codes) lists the other codes.
