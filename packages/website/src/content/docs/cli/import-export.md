---
title: "CLI: Import & Export"
description: Convert collections between formats using the Nouto CLI.
sidebar:
  order: 3
---

The `nouto import` and `nouto export` commands convert collections between formats from the command line.

## Import

```bash
nouto import <file> [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--from <format>` | Source format (see below) | Auto-detect |
| `-o, --output <file>` | Output file | `<name>.nouto.json` |

### Supported Formats

| Format | `--from` value | Auto-detected by |
|--------|---------------|-----------------|
| Postman | `postman` | `info.schema` or `info._postman_id` in JSON |
| Insomnia | `insomnia` | `_type: "export"` in JSON |
| Hoppscotch | `hoppscotch` | Array with `v` and `name` fields |
| Thunder Client | `thunder-client` | Array with `containerId` field |
| HAR | `har` | `log.version` and `log.entries` in JSON |
| OpenAPI | `openapi` | `openapi` or `swagger` field, or `.yaml`/`.yml` extension |
| Bruno | `bruno` | `.bru` file extension |
| cURL | `curl` | Content starts with `curl ` |

### Examples

```bash
# Auto-detect format
nouto import postman-collection.json

# Explicit format
nouto import spec.yaml --from openapi

# Custom output path
nouto import collection.json --output my-api.nouto.json
```

## Export

```bash
nouto export <collection-file> [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--to <format>` | Target format: `nouto`, `har` | `nouto` |
| `-o, --output <file>` | Output file | `<name>.<ext>` |

### Examples

```bash
# Export as Nouto native
nouto export my-api.nouto.json

# Export as HAR
nouto export my-api.nouto.json --to har --output traffic.har
```

## Workflow

Convert a Postman collection for use with `nouto run`:

```bash
nouto import postman-collection.json --output my-api.nouto.json
nouto run my-api.nouto.json --reporter junit --output results.xml
```
