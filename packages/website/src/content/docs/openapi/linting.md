---
title: Linting
description: Configurable lint rules, grouped by category, that check for security, completeness, and design issues in OpenAPI specs.
sidebar:
  order: 2
---

The OpenAPI editor ships a set of lint rules organized into groups. Each rule has a configurable severity: **Off**, **Warning**, or **Error**. Rules run automatically as you type and produce inline diagnostics. Most rules have a one-click [quick fix](/openapi/diagnostics#lint-rule-quick-fixes); the "Fix" column says which.

## Security

| Rule | Default | Fix | Description |
|------|---------|-----|-------------|
| `http-basic-scheme` | Warning | No | HTTP Basic authentication transmits credentials with every request |
| `api-key-in-query` | Warning | Yes | API keys in the query string leak into logs, browser history, and referrer headers |

## Servers

| Rule | Default | Fix | Description |
|------|---------|-----|-------------|
| `server-uses-http` | Warning | Yes | Server URL uses plaintext `http://` instead of `https://` |
| `server-url-has-credentials` | Error | Yes | Server URL embeds userinfo (`user:pass@host`), exposing credentials in the spec |

## Responses

| Rule | Default | Fix | Description |
|------|---------|-----|-------------|
| `operation-missing-4xx` | Warning | Yes | Operation declares no client error (4xx) or `default` response |
| `operation-missing-5xx` | Warning | Yes | Operation declares no server error (5xx) or `default` response |

Both response rules have a quick fix that adds a `default` response. When both rules fire on the same operation, the fix is deduplicated so only one `default` response is inserted.

## Schemas

| Rule | Default | Fix | Description |
|------|---------|-----|-------------|
| `schema-unconstrained-additional-properties` | Warning | Yes | Object schema does not constrain `additionalProperties`, allowing arbitrary fields |
| `parameter-unbounded` | Warning | Yes | String or array parameter has no `maxLength` or `maxItems`, allowing unbounded input |

Both schema rules have quick fixes: `additionalProperties: false` for unconstrained schemas, and `maxLength: 255` or `maxItems: 100` for unbounded parameters.

## Metadata

| Rule | Default | Fix | Description |
|------|---------|-----|-------------|
| `missing-info-description` | Warning | Yes | The `info` object has no `description` |
| `operation-missing-description` | Warning | Yes | Operation has neither a `summary` nor a `description` |
| `operation-missing-tags` | Warning | Yes | Operation declares no tags, so it cannot be grouped in documentation |
| `operation-missing-operation-id` | Warning | Yes | Operation has no `operationId`, which client generators rely on |

The `operation-missing-tags` and `operation-missing-operation-id` rules have quick fixes that derive a tag from the first static path segment and an operationId from the method and path.

## Policy

Policy rules encode opinions about API design rather than defects. They are on by default, but turning them off is normal if they do not match your team's conventions.

| Rule | Default | Fix | Description |
|------|---------|-----|-------------|
| `operation-without-security` | Warning | Yes | Operation defines no security requirement and no global `security` default applies |
| `unused-component-schema` | Warning | Yes | A component schema defined under `components/schemas` is never referenced by any `$ref` |

## Opt-in

Opt-in rules are disabled by default and must be enabled in Settings.

| Rule | Default | Fix | Description |
|------|---------|-----|-------------|
| `rate-limit-headers` | Warning | Yes | Successful responses declare no rate-limit headers (`X-RateLimit-*` or `RateLimit`) |

## Configuring Severity

1. Open **Settings**.
2. Navigate to **OpenAPI** > **Linting**.
3. Set each rule to **Off**, **Warning**, or **Error**.

Rules are grouped by category. Changes take effect immediately on all open specs without requiring an edit.
