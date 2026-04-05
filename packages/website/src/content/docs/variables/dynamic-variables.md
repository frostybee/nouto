---
title: Dynamic Variables
description: Use built-in dynamic variables in Nouto to generate UUIDs, timestamps, random data, hashes, and encoded values at request time.
sidebar:
  order: 2
---

Dynamic variables generate a fresh value every time a request is sent. No environment setup required. Type `{{$` in any field to see the autocomplete list.

<!-- screenshot: variables/dynamic-variable-autocomplete.png -->
![URL bar with {{$uuid.v4}} typed, and an inline tooltip showing the resolved value before sending](/screenshots/variables/dynamic-variable-autocomplete.png)

## Syntax

Dynamic variables use a `$namespace.method` format with optional comma-separated arguments:

```
{{$uuid.v4}}
{{$timestamp.iso}}
{{$random.int, 1, 100}}
{{$hash.sha256, my-value}}
{{$encode.base64, user:password}}
```

## UUID

| Variable | Output |
|----------|--------|
| `{{$uuid.v4}}` | Random UUID v4: `550e8400-e29b-41d4-a716-446655440000` |
| `{{$uuid.v7}}` | Time-ordered UUID v7 (monotonically increasing) |

Use `{{$uuid.v4}}` for random IDs and `{{$uuid.v7}}` when you need UUIDs that sort by creation time.

## Timestamps

| Variable | Output |
|----------|--------|
| `{{$timestamp.unix}}` | Seconds since epoch: `1706886400` |
| `{{$timestamp.millis}}` | Milliseconds since epoch: `1706886400000` |
| `{{$timestamp.iso}}` | ISO 8601: `2024-02-02T12:00:00.000Z` |
| `{{$timestamp.offset, 30, m}}` | Unix seconds 30 minutes from now |
| `{{$timestamp.offset, -1, d}}` | Unix seconds 1 day ago |
| `{{$timestamp.format, YYYY-MM-DD}}` | Formatted date: `2024-02-02` |

**Offset units:** `s` (seconds), `m` (minutes), `h` (hours), `d` (days).

**Format tokens:** `YYYY` (year), `MM` (month), `DD` (day), `HH` (24h hour), `mm` (minute), `ss` (second).

## Random Data

| Variable | Output |
|----------|--------|
| `{{$random.int}}` | Integer 0–1000 |
| `{{$random.int, 1, 100}}` | Integer between 1 and 100 |
| `{{$random.number, 0.5, 9.5}}` | Float with 2 decimal places |
| `{{$random.string}}` | 16-character alphanumeric string |
| `{{$random.string, 32}}` | 32-character string (1–256) |
| `{{$random.bool}}` | `true` or `false` |
| `{{$random.enum, dev, staging, prod}}` | Random pick from the list |
| `{{$random.name}}` | Random full name: `Jennifer Garcia` |
| `{{$random.email}}` | Random email: `jennifer.garcia482@example.com` |

`$random.int` produces integers. `$random.number` produces floats when either bound is a float.

## Hashing

All hash variables take the input value as the first argument:

| Variable | Algorithm |
|----------|-----------|
| `{{$hash.md5, input}}` | MD5 (hex string) |
| `{{$hash.sha1, input}}` | SHA-1 (hex string) |
| `{{$hash.sha256, input}}` | SHA-256 (hex string) |
| `{{$hash.sha512, input}}` | SHA-512 (hex string) |

HMAC variants take input and key:

| Variable | Algorithm |
|----------|-----------|
| `{{$hmac.md5, input, key}}` | HMAC-MD5 |
| `{{$hmac.sha1, input, key}}` | HMAC-SHA1 |
| `{{$hmac.sha256, input, key}}` | HMAC-SHA256 |
| `{{$hmac.sha512, input, key}}` | HMAC-SHA512 |

Combine with environment variables for signing:

```
X-Signature: {{$hmac.sha256, {{requestBody}}, {{API_SECRET}}}}
```

## Encoding and Decoding

| Variable | Description |
|----------|-------------|
| `{{$encode.base64, input}}` | Base64 encode |
| `{{$encode.base64url, input}}` | Base64url encode (URL-safe, no padding) |
| `{{$encode.url, input}}` | URL percent-encode |
| `{{$encode.html, input}}` | HTML entity encode (`<` → `&lt;`) |
| `{{$decode.base64, input}}` | Base64 decode |
| `{{$decode.url, input}}` | URL percent-decode |

## String Operations

| Variable | Description |
|----------|-------------|
| `{{$regex.match, input, pattern, flags}}` | First match of `pattern` in `input` |
| `{{$regex.replace, input, pattern, replacement, flags}}` | Replace `pattern` in `input` with `replacement` |
| `{{$json.escape, input}}` | Escape a string for safe embedding in a JSON value |
| `{{$json.minify, input}}` | Minify a JSON string (remove whitespace) |

## Examples

**Generate a Basic auth header:**
```
Authorization: Basic {{$encode.base64, {{USERNAME}}:{{PASSWORD}}}}
```

**Create an expiring token timestamp:**
```json
{
  "issued_at": "{{$timestamp.unix}}",
  "expires_at": "{{$timestamp.offset, 1, h}}"
}
```

**Sign a webhook payload:**
```
X-Hub-Signature-256: sha256={{$hmac.sha256, {{body}}, {{WEBHOOK_SECRET}}}}
```

**Generate test data for a user creation request:**
```json
{
  "id": "{{$uuid.v4}}",
  "name": "{{$random.name}}",
  "email": "{{$random.email}}",
  "role": "{{$random.enum, admin, editor, viewer}}",
  "createdAt": "{{$timestamp.iso}}"
}
```
