---
title: Variable Substitution
description: Reference for all variable types supported in Nouto.
---

Variables can be used in URLs, query parameters, headers, and request bodies using the `{{variableName}}` syntax.

## Environment Variables

Defined in the Environments panel. The active environment's variables are resolved at send time.

```
{{baseUrl}}/api/users
```

## Dynamic Variables

Dynamic variables are built-in functions that generate values at send time. They use a `$namespace.method` syntax.

### UUID

| Variable | Example Output |
|----------|---------------|
| `{{$uuid.v4}}` | `a1b2c3d4-e5f6-7890-abcd-ef1234567890` |
| `{{$uuid.v7}}` | `0195f13a-e2c0-7abc-8def-1234567890ab` |

### Timestamps

| Variable | Example Output |
|----------|---------------|
| `{{$timestamp.unix}}` | `1741795200` |
| `{{$timestamp.millis}}` | `1741795200000` |
| `{{$timestamp.iso}}` | `2026-03-12T12:00:00.000Z` |
| `{{$timestamp.offset, N, unit}}` | Unix timestamp offset by N units (`s`, `m`, `h`, `d`) |
| `{{$timestamp.format, YYYY-MM-DD}}` | Custom format using `YYYY`, `MM`, `DD`, `HH`, `mm`, `ss` tokens |

### Random

| Variable | Example Output |
|----------|---------------|
| `{{$random.int, 0, 1000}}` | `427` |
| `{{$random.number, 0, 1}}` | `0.73` |
| `{{$random.string, 16}}` | `aBcDeFgH1234XyZw` |
| `{{$random.bool}}` | `true` |
| `{{$random.enum, a, b, c}}` | `b` (random pick from the list) |
| `{{$random.name}}` | `James Smith` |
| `{{$random.email}}` | `james.smith423@example.com` |

### Hashing

| Variable | Description |
|----------|-------------|
| `{{$hash.md5, value}}` | MD5 hash of `value` |
| `{{$hash.sha1, value}}` | SHA-1 hash of `value` |
| `{{$hash.sha256, value}}` | SHA-256 hash of `value` |
| `{{$hash.sha512, value}}` | SHA-512 hash of `value` |

### HMAC

| Variable | Description |
|----------|-------------|
| `{{$hmac.md5, input, key}}` | HMAC-MD5 of `input` with `key` |
| `{{$hmac.sha1, input, key}}` | HMAC-SHA1 of `input` with `key` |
| `{{$hmac.sha256, input, key}}` | HMAC-SHA256 of `input` with `key` |
| `{{$hmac.sha512, input, key}}` | HMAC-SHA512 of `input` with `key` |

### Encoding / Decoding

| Variable | Description |
|----------|-------------|
| `{{$encode.base64, value}}` | Base64-encode `value` |
| `{{$encode.base64url, value}}` | Base64 URL-safe encode `value` |
| `{{$encode.url, value}}` | Percent-encode `value` for use in a URL |
| `{{$encode.html, value}}` | HTML-entity-encode `value` |
| `{{$decode.base64, value}}` | Decode a Base64 string |
| `{{$decode.url, value}}` | Decode a percent-encoded string |

### Regex

| Variable | Description |
|----------|-------------|
| `{{$regex.match, input, pattern, flags}}` | Return the first match of `pattern` in `input` |
| `{{$regex.replace, input, pattern, replacement, flags}}` | Replace `pattern` in `input` with `replacement` |

### JSON

| Variable | Description |
|----------|-------------|
| `{{$json.escape, value}}` | JSON-escape `value` (safe for embedding in a string literal) |
| `{{$json.minify, value}}` | Minify a JSON string by removing whitespace |

## Response References

Access values from the most recent response in the current session:

```
{{$response.body.token}}
{{$response.body.data[0].id}}
{{$response.status}}
{{$response.headers.content-type}}
```

In the Collection Runner, you can also reference the response of a specific named request:

```
{{Login.$response.body.token}}
{{Login.$response.status}}
{{Login.$response.headers.x-request-id}}
```

## Cookie Variables

```
{{$cookie.sessionId}}
```

Resolved from the active cookie jar at send time.

## Folder Variables

Variables defined at the folder level override environment variables for all requests within that folder.

## Resolution Order

When a `{{variableName}}` placeholder is resolved, Nouto checks sources in this order (first match wins):

1. **Folder variables** — defined on the containing folder (most specific)
2. **Active environment variables** — from the currently selected environment
3. **Global variables** — defined in the Globals tab
4. **`.env` file variables** — from the linked `.env` file
5. **Dynamic variables** — built-in `$namespace.method` functions
