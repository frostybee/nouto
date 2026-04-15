---
title: Dynamic Variables
description: Use built-in dynamic variables in Nouto to generate UUIDs, timestamps, random data, hashes, and encoded values at request time.
sidebar:
  order: 2
---

Dynamic variables generate a fresh value every time a request is sent. No environment setup required. Type `{{$` in any field — including the body editor — to see the autocomplete list.

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
{{$faker.email}}
{{$prompt.apiKey}}
{{$file.read, /path/to/data.json}}
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

## Mock Data (Faker)

Generate realistic fake data powered by [Faker](https://fakerjs.dev/). All values are random and change on every send.

### Person

| Variable | Example output |
|----------|---------------|
| `{{$faker.firstName}}` | `Sarah` |
| `{{$faker.lastName}}` | `Johnson` |
| `{{$faker.fullName}}` | `Sarah Johnson` |
| `{{$faker.jobTitle}}` | `Senior Software Engineer` |
| `{{$faker.gender}}` | `Female` |
| `{{$faker.prefix}}` | `Dr.` |

### Internet

| Variable | Example output |
|----------|---------------|
| `{{$faker.email}}` | `sarah.johnson@example.com` |
| `{{$faker.username}}` | `sarah_j92` |
| `{{$faker.url}}` | `https://example.com` |
| `{{$faker.ip}}` | `192.168.1.42` |
| `{{$faker.ipv6}}` | `2001:0db8:85a3::8a2e:0370:7334` |
| `{{$faker.mac}}` | `00:1A:2B:3C:4D:5E` |
| `{{$faker.password}}` | `xK9$mP2vL` |
| `{{$faker.userAgent}}` | `Mozilla/5.0 (Windows NT 10.0; ...)` |

### Location

| Variable | Example output |
|----------|---------------|
| `{{$faker.city}}` | `San Francisco` |
| `{{$faker.country}}` | `Canada` |
| `{{$faker.countryCode}}` | `CA` |
| `{{$faker.state}}` | `California` |
| `{{$faker.streetAddress}}` | `742 Evergreen Terrace` |
| `{{$faker.zipCode}}` | `94107` |
| `{{$faker.latitude}}` | `37.7749` |
| `{{$faker.longitude}}` | `-122.4194` |
| `{{$faker.timeZone}}` | `America/New_York` |

### Finance

| Variable | Example output |
|----------|---------------|
| `{{$faker.creditCard}}` | `4532015112830366` |
| `{{$faker.iban}}` | `DE89370400440532013000` |
| `{{$faker.currencyCode}}` | `USD` |
| `{{$faker.currencyName}}` | `US Dollar` |
| `{{$faker.amount}}` | `42.99` |
| `{{$faker.bitcoinAddress}}` | `1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa` |

### Text and Data

| Variable | Example output |
|----------|---------------|
| `{{$faker.uuid}}` | `550e8400-e29b-41d4-a716-446655440000` |
| `{{$faker.boolean}}` | `true` |
| `{{$faker.word}}` | `synergy` |
| `{{$faker.words}}` | `innovative digital platform` |
| `{{$faker.sentence}}` | `The quick brown fox jumps over the lazy dog.` |
| `{{$faker.paragraph}}` | A full paragraph of lorem-style text |
| `{{$faker.slug}}` | `innovative-digital-platform` |

### Other

| Variable | Example output |
|----------|---------------|
| `{{$faker.phone}}` | `+1-555-0123` |
| `{{$faker.company}}` | `Acme Corp` |
| `{{$faker.colorHex}}` | `#e04f2b` |
| `{{$faker.colorName}}` | `cerulean` |
| `{{$faker.imageUrl}}` | A random image URL |
| `{{$faker.avatar}}` | A random avatar URL |

:::tip
Type `{{$faker.` to see the full list in autocomplete. Over 60 faker functions are available.
:::

## Prompt at Send Time

Prompt the user for a value when the request is sent. The value is used once and not saved.

| Variable | Description |
|----------|-------------|
| `{{$prompt.keyName}}` | Shows a dialog prompting for "keyName" before sending |

When a request contains `$prompt` variables, a dialog appears before the request is sent with an input field for each unique key. If the same key appears multiple times, only one field is shown.

```json
{
  "token": "{{$prompt.apiToken}}",
  "environment": "{{$prompt.targetEnv}}"
}
```

- **Cancel** aborts the request — nothing is sent.
- **Multiple keys** are collected in a single dialog.
- Values are not stored anywhere — they are discarded after the request completes.

## File Read

Read file content at send time and substitute it inline.

| Variable | Description |
|----------|-------------|
| `{{$file.read, /path/to/file.txt}}` | Replaced with the file's text content |

Use this to inject certificates, configuration files, or large payloads without pasting them into the editor.

```
Authorization: Bearer {{$file.read, /home/user/.secrets/token.txt}}
```

```json
{
  "config": {{$file.read, C:/projects/config.json}}
}
```

If the file cannot be read (not found or permission error), the token is left unresolved and a warning is logged to the console.

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

**Generate realistic fake data with Faker:**
```json
{
  "id": "{{$faker.uuid}}",
  "name": "{{$faker.fullName}}",
  "email": "{{$faker.email}}",
  "phone": "{{$faker.phone}}",
  "address": "{{$faker.streetAddress}}, {{$faker.city}}, {{$faker.country}}",
  "bio": "{{$faker.sentence}}"
}
```

**Prompt for credentials at send time:**
```
Authorization: Bearer {{$prompt.apiToken}}
```

**Inject a file as the request body:**
```
{{$file.read, /path/to/payload.json}}
```
