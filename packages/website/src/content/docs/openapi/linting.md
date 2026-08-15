---
title: Linting
description: Fifteen configurable lint rules across seven groups that check for security, completeness, and design issues in OpenAPI specs.
sidebar:
  order: 2
---

The OpenAPI editor includes 15 lint rules organized into seven groups. Each rule has a configurable severity: **Off**, **Warning**, or **Error**. Rules run automatically as you type and produce inline diagnostics. Six rules have one-click [quick fixes](/openapi/diagnostics).

## Security

| Rule | Default | Description |
|------|---------|-------------|
| `http-basic-scheme` | Warning | HTTP Basic authentication transmits credentials with every request |
| `api-key-in-query` | Warning | API keys in the query string leak into logs, browser history, and referrer headers |

## Servers

| Rule | Default | Description |
|------|---------|-------------|
| `server-uses-http` | Warning | Server URL uses plaintext `http://` instead of `https://` |
| `server-url-has-credentials` | Error | Server URL embeds userinfo (`user:pass@host`), exposing credentials in the spec |

## Responses

| Rule | Default | Description |
|------|---------|-------------|
| `operation-missing-4xx` | Warning | Operation declares no client error (4xx) or `default` response |
| `operation-missing-5xx` | Warning | Operation declares no server error (5xx) or `default` response |

Both response rules have a quick fix that adds a `default` response. When both rules fire on the same operation, the fix is deduplicated so only one `default` response is inserted.

## Schemas

| Rule | Default | Description |
|------|---------|-------------|
| `schema-unconstrained-additional-properties` | Warning | Object schema does not constrain `additionalProperties`, allowing arbitrary fields |
| `parameter-unbounded` | Warning | String or array parameter has no `maxLength` or `maxItems`, allowing unbounded input |

Both schema rules have quick fixes: `additionalProperties: false` for unconstrained schemas, and `maxLength: 255` or `maxItems: 100` for unbounded parameters.

## Metadata

| Rule | Default | Description |
|------|---------|-------------|
| `missing-info-description` | Warning | The `info` object has no `description` |
| `operation-missing-description` | Warning | Operation has neither a `summary` nor a `description` |
| `operation-missing-tags` | Warning | Operation declares no tags, so it cannot be grouped in documentation |
| `operation-missing-operation-id` | Warning | Operation has no `operationId`, which client generators rely on |

The `operation-missing-tags` and `operation-missing-operation-id` rules have quick fixes that derive a tag from the first static path segment and an operationId from the method and path.

## Policy

Policy rules encode opinions about API design rather than defects. They are on by default, but turning them off is normal if they do not match your team's conventions.

| Rule | Default | Description |
|------|---------|-------------|
| `operation-without-security` | Warning | Operation defines no security requirement and no global `security` default applies |
| `unused-component-schema` | Warning | A component schema defined under `components/schemas` is never referenced by any `$ref` |

## Opt-in

Opt-in rules are disabled by default and must be enabled in Settings.

| Rule | Default | Description |
|------|---------|-------------|
| `rate-limit-headers` | Warning | Successful responses declare no rate-limit headers (`X-RateLimit-*` or `RateLimit`) |

## Configuring Severity

1. Open **Settings**.
2. Navigate to **OpenAPI** > **Linting**.
3. Set each rule to **Off**, **Warning**, or **Error**.

Rules are grouped by category. Changes take effect immediately on all open specs without requiring an edit.
