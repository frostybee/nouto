---
title: Linting
description: Reference for the 65 OpenAPI lint rules in Nouto, with their default severities, quick fixes, and how to configure them.
sidebar:
  order: 2
---

Nouto's OpenAPI linter has 65 rules in 11 groups: Security, Servers, Responses, Paths, Schemas, Components, OWASP, OpenAPI 3.2, Metadata, Policy, and Opt-in. The rules run as you type and report their findings as diagnostics, each labeled with the rule ID. You can set each rule to **Off**, **Warning**, or **Error**, as described in [Configure rule severity](#configure-rule-severity).

The **Default** column shows the severity a rule uses until you change it. The **Fix** column shows whether the rule has a one-click [quick fix](/openapi/diagnostics#lint-rule-quick-fixes); 41 rules do.

## Security

These rules flag authentication schemes and text that put credentials or users at risk.

| Rule | Default | Fix | Description |
|------|---------|-----|-------------|
| `http-basic-scheme` | Warning | No | HTTP Basic authentication transmits credentials with every request |
| `api-key-in-query` | Warning | Yes | API keys in the query string leak into logs, browser history, and referrer headers |
| `markdown-unsafe` | Warning | No | A `description`, `summary`, `title`, or `termsOfService` contains a `<script>` tag, `eval(`, or a `javascript:` URL that could execute in rendered documentation |

## Servers

These rules check the URLs and variables in `servers` entries.

| Rule | Default | Fix | Description |
|------|---------|-----|-------------|
| `server-uses-http` | Warning | Yes | Server URL uses plaintext `http://` instead of `https://` |
| `server-url-has-credentials` | Error | Yes | Server URL embeds userinfo (`user:pass@host`), exposing credentials in the spec |
| `server-url-trailing-slash` | Warning | Yes | Server URL ends with a slash, which doubles up when joined with paths (a bare `/` is allowed) |
| `servers-empty` | Warning | Yes | The document declares no servers (skipped for components-only documents) |
| `server-variable-undefined` | Error | Yes | Server URL uses a `{variable}` that the server does not declare under `variables` |
| `server-variable-empty-enum` | Error | No | A server variable declares an empty `enum`, or a `default` outside its `enum` |

## Responses

These rules check that operations document their error responses.

| Rule | Default | Fix | Description |
|------|---------|-----|-------------|
| `operation-missing-4xx` | Warning | Yes | Operation declares no client error (4xx) or `default` response |
| `operation-missing-5xx` | Warning | Yes | Operation declares no server error (5xx) or `default` response |

Both rules share one quick fix that adds a `default` response. When both fire on the same operation, the fix is offered once and inserts a single `default` response.

## Paths

These rules check path keys, path templates, and the parameters declared for each operation.

| Rule | Default | Fix | Description |
|------|---------|-----|-------------|
| `operation-duplicate-parameter` | Error | Yes | An operation declares the same parameter (`name` + `in`) more than once (a path-level parameter re-declared on the operation is a legitimate override and is not flagged) |
| `path-template-empty` | Error | No | A path key contains an empty `{}` template or repeats the same template variable |
| `path-key-trailing-slash` | Warning | Yes | A path key ends with `/`; most routers treat `/a` and `/a/` differently |
| `path-key-has-query` | Error | Yes | A path key contains `?`; declare query parameters with `in: query` instead |
| `path-duplicate` | Error | No | Two path keys are identical except for template variable names (`/pets/{id}` and `/pets/{petId}`) |
| `path-ambiguous` | Warning | No | A concrete segment overlaps a template segment in another path with the same shape (`/users/me` vs `/users/{id}`). Suppressed when the template parameter's declared schema provably rejects the literal (e.g. `{petId}` typed as `integer` won't match `findByStatus`) |

The `path-key-trailing-slash` and `path-key-has-query` fixes change only the path key. The operations under it and their formatting stay as they are.

The `path-ambiguous` rule checks the template parameter's declared `type`, `enum`, `pattern`, `const`, and numeric bounds. If every operation on the templated path declares a schema that rejects the literal segment, the warning is suppressed. Parameters without a `schema` (e.g. using `content`), undeclared parameters, and composition keywords (`oneOf`/`anyOf`/`allOf`) are treated as unconstrained and still produce the warning.

## Schemas

These rules check Schema Objects and the examples attached to them.

| Rule | Default | Fix | Description |
|------|---------|-----|-------------|
| `schema-unconstrained-additional-properties` | Warning | Yes | Object schema does not constrain `additionalProperties`, allowing arbitrary fields |
| `parameter-unbounded` | Warning | Yes | String or array parameter has no `maxLength` or `maxItems`, allowing unbounded input |
| `enum-duplicate-values` | Error | Yes | A schema `enum` lists the same value more than once (deep equality) |
| `enum-type-mismatch` | Error | No | An `enum` value does not match the declared `type` (respects `nullable` and 3.1 type arrays) |
| `schema-required-property-undefined` | Warning | Yes | A `required` name is not defined under `properties` (skipped when `allOf`/`oneOf`/`anyOf`, `patternProperties`, or an `additionalProperties` schema could supply it) |
| `schema-nullable-without-type` | Warning | No | OpenAPI 3.0: `nullable` is set on a schema without `type`, where it has no effect |
| `schema-nullable-in-31` | Warning | Yes | OpenAPI 3.1+: `nullable` is not a JSON Schema keyword; use `type: [..., "null"]` |
| `schema-mixed-range-constraints` | Warning | No | `maximum` and `exclusiveMaximum` (or the minimum pair) are both set in 3.1+, or a 3.0 boolean `exclusiveMaximum: true` has no `maximum` |
| `example-invalid-schema` | Warning | No | A schema's `example` (or a 3.1+ `examples` entry) does not validate against that schema |
| `example-invalid-media` | Warning | No | A media type or parameter `example` / `examples.*.value` does not validate against its `schema` |

The two `example-invalid-*` rules validate each example against its schema with a full JSON Schema validator: Ajv in the VS Code extension, and the Rust `jsonschema` crate in the desktop app. In the desktop app, their results appear a moment after the other diagnostics. These rules skip examples that use `externalValue`, Example Objects referenced through `$ref`, and schemas defined in other files. They respect OpenAPI 3.0 `nullable: true`.

Schema rules visit every Schema Object in the document, including inline schemas under parameters, headers, request bodies, and responses, and every nested sub-schema. `$ref` targets are checked where they are defined, not at each usage.

## Components

These rules check `$ref` usage, component definitions, security requirements, callbacks, and webhooks.

| Rule | Default | Fix | Description |
|------|---------|-----|-------------|
| `ref-has-siblings` | Warning | Yes | Keys next to `$ref` are ignored: any sibling in OpenAPI 3.0; anything besides `summary`/`description` in a 3.1+ Reference Object (3.1 Schema Objects follow JSON Schema and are not checked) |
| `example-value-and-external-value` | Error | Yes | An Example Object sets both `value` and `externalValue` |
| `component-key-invalid` | Error | No | A component key contains characters outside `[a-zA-Z0-9.-_]` |
| `unused-component` | Warning | Yes | A parameter, response, request body, header, example, link, callback, or path item component is never referenced, or a security scheme is never required (skipped for components-only documents) |
| `security-scheme-undefined` | Error | No | A security requirement names a scheme missing from `components.securitySchemes` |
| `security-scope-undefined` | Error | No | A security requirement lists an OAuth2 scope that none of the scheme's flows declare |
| `callback-nested` | Warning | No | A callback operation defines its own callbacks |
| `webhook-has-servers` | Warning | No | A webhook path item or operation declares `servers` |
| `webhook-has-callbacks` | Warning | No | A webhook operation declares `callbacks` |

## OWASP

These rules implement checks from the OWASP API Security Top 10, modeled on the OWASP rulesets of the vacuum and Spectral linters. They are on by default. For an internal API, set the rules you don't need to **Off**. The schema checks visit every Schema Object in the document.

| Rule | Default | Fix | Description |
|------|---------|-----|-------------|
| `owasp-integer-unbounded` | Warning | Yes | An integer schema lacks a `minimum` or a `maximum` (exclusive variants count). Schemas with `enum` or `const` are exempt |
| `owasp-integer-no-format` | Warning | Yes | An integer schema declares no `format` (`int32` or `int64`) |
| `owasp-string-unrestricted` | Warning | Yes | A string schema has none of `maxLength`, `pattern`, `enum`, `format`, `const` (operation parameter schemas are left to `parameter-unbounded`) |
| `owasp-array-unbounded` | Warning | Yes | An array schema has no `maxItems` (operation parameter schemas are left to `parameter-unbounded`) |
| `owasp-response-401-missing` | Warning | Yes | An operation that requires authentication declares no explicit `401` response |
| `owasp-response-429-missing` | Warning | Yes | An operation declares no explicit `429` response |
| `owasp-response-500-missing` | Warning | Yes | An operation declares no explicit `500` response |
| `owasp-429-retry-after` | Warning | Yes | An inline `429` response declares no `Retry-After` header |
| `owasp-jwt-best-practices` | Warning | Yes | A bearer JWT, OAuth2, or OpenID Connect scheme's description does not mention RFC 8725 |
| `owasp-auth-insecure-scheme` | Warning | No | An HTTP security scheme uses `negotiate` or `oauth` (1.0) |
| `owasp-credentials-in-query` | Warning | No | A query parameter is named like a credential (`api_key`, `access_token`, `password`, `secret`, `token`, ...) |
| `owasp-numeric-id` | Warning | No | A path parameter named `...id` has an integer type; sequential ids invite enumeration |
| `owasp-unsafe-operation-unprotected` | Warning | Yes | A POST/PUT/PATCH/DELETE (or other non-safe) operation runs without any security requirement, including `security: []` overrides |

The fixes insert placeholder values: `minimum: 0`, `maximum: 1000000`, `maxLength: 255`, `maxItems: 100`, and `format: int64`. Change them to your API's real limits.

## OpenAPI 3.2

These rules check structures that OpenAPI 3.2 introduced. They run whenever the structure is present, so a 3.1 document that already uses one is checked too.

| Rule | Default | Fix | Description |
|------|---------|-----|-------------|
| `querystring-parameter-conflict` | Error | No | An operation declares more than one `in: querystring` parameter, or mixes one with `in: query` parameters |
| `tag-parent-invalid` | Error | No | A tag's `parent` names no root tag, or the parent chain forms a cycle |
| `discriminator-default-mapping-invalid` | Error | No | `discriminator.defaultMapping` is not a `components.schemas` name and is not a resolvable internal reference (external URIs are not checked) |
| `media-type-encoding-conflict` | Error | No | A Media Type Object uses more than one of `encoding`, `prefixEncoding`, `itemEncoding`, or uses a sequential encoding without `itemSchema` |

## Metadata

These rules check that the document and its operations carry the descriptive fields that documentation and client generators use.

| Rule | Default | Fix | Description |
|------|---------|-----|-------------|
| `missing-info-description` | Warning | Yes | The `info` object has no `description` |
| `operation-missing-description` | Warning | Yes | Operation has neither a `summary` nor a `description` |
| `operation-missing-tags` | Warning | Yes | Operation declares no tags, so it cannot be grouped in documentation |
| `operation-missing-operation-id` | Warning | Yes | Operation has no `operationId`, which client generators rely on |
| `info-missing-contact` | Warning | Yes | The `info` object has no `contact` |
| `operation-tag-undefined` | Warning | Yes | An operation uses a tag that the root `tags` list does not declare (silent when the document has no root `tags` at all) |
| `tag-duplicate-name` | Error | Yes | The root `tags` list declares the same name more than once |

## Policy

Policy rules encode opinions about API design rather than defects. They are on by default. Turn them off if they don't match your API's conventions.

| Rule | Default | Fix | Description |
|------|---------|-----|-------------|
| `operation-without-security` | Warning | Yes | Operation defines no security requirement and no global `security` default applies |
| `unused-component-schema` | Warning | Yes | A component schema defined under `components/schemas` is never referenced by any `$ref` (skipped for components-only documents; references from other files are not counted) |

## Opt-in

Opt-in rules are off by default. An opt-in rule runs only after you set it to **Warning** or **Error** in Settings, and opt-in rules added in later Nouto versions also start off. The **Default** column shows the severity the rule uses once you turn it on.

| Rule | Default | Fix | Description |
|------|---------|-----|-------------|
| `rate-limit-headers` | Warning | Yes | Successful responses declare no rate-limit headers (`X-RateLimit-*` or `RateLimit`) |
| `info-missing-license` | Warning | Yes | The `info` object has no `license` |
| `tag-missing-description` | Warning | Yes | A root tag has no `description` |

## Configure rule severity

1. Open **Settings** and select **OpenAPI**. In VS Code, you can also click **OpenAPI Settings** in the OpenAPI Outline title bar.
2. Under **Lint rules**, find the rule. Rules are listed by group, with their IDs and descriptions.
3. Set the rule to **Off**, **Warning**, or **Error**.

Nouto re-checks every open spec as soon as you change a severity.

To turn off every lint rule at once, turn off **Enable OpenAPI linting** in the same section. The severity controls are disabled while linting is off, and your per-rule choices return when you turn it back on. Structural diagnostics and meta-schema validation keep running. See [Diagnostics and quick fixes](/openapi/diagnostics).
