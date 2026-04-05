---
title: Variable Substitution
description: Complete reference for all variable types supported in Nouto, including environment variables, dynamic variables, response references, and more.
sidebar:
  order: 1
---

Variables are resolved at request time. Use `{{...}}` syntax in any request field. This page covers all variable types and where they can be used.

## Where Variables Work

Variables are substituted in all of the following fields before a request is sent:

- **URL**: `{{baseUrl}}/users/{{userId}}`
- **Query parameters**: keys and values
- **Headers**: keys and values
- **Body**: JSON, text, form data, URL-encoded, GraphQL query and variables
- **Authentication**: all credential fields (token, username, password, API key, OAuth URLs)

## Variable Types

| Type | Syntax | Source |
|------|--------|--------|
| Environment / Global / `.env` | `{{name}}` | Variables tab and linked file |
| Dynamic (built-in) | `{{$namespace.method}}` | Generated at request time |
| Response chaining | `{{$response.body.*}}` | Previous response data |
| Cookie | `{{$cookie.name}}` | Active cookie jar |
| Named response | `{{RequestName.$response.*}}` | Specific request in a runner run |

## Resolution Priority

When the same variable name exists in multiple sources:

| Priority | Source |
|----------|--------|
| 1 — Highest | Active environment |
| 2 | Global variables |
| 3 | Linked `.env` file |

Dynamic and response variables always resolve against live data and are not affected by this priority chain.

## Dynamic Variables

Dynamic variables generate a fresh value each time a request is sent. They use a `$namespace.method` format, with optional comma-separated arguments.

### UUID

| Variable | Description | Example output |
|----------|-------------|----------------|
| `{{$uuid.v4}}` | Random UUID version 4 | `550e8400-e29b-41d4-a716-446655440000` |
| `{{$uuid.v7}}` | Time-ordered UUID version 7 | `018e7b2c-4a3d-7f6e-8a9b-0c1d2e3f4a5b` |

### Timestamps

| Variable | Description | Example output |
|----------|-------------|----------------|
| `{{$timestamp.unix}}` | Current time as Unix seconds | `1706886400` |
| `{{$timestamp.millis}}` | Current time in milliseconds | `1706886400000` |
| `{{$timestamp.iso}}` | ISO 8601 timestamp | `2024-02-02T12:00:00.000Z` |
| `{{$timestamp.offset, amount, unit}}` | Offset from now (`s`, `m`, `h`, `d`) | `{{$timestamp.offset, 30, m}}` |
| `{{$timestamp.format, FORMAT}}` | Custom format (see tokens below) | `{{$timestamp.format, YYYY-MM-DD}}` |

Format tokens: `YYYY` (year), `MM` (month), `DD` (day), `HH` (hour), `mm` (minute), `ss` (second).

### Random Values

| Variable | Description | Example output |
|----------|-------------|----------------|
| `{{$random.int}}` | Random integer 0–1000 | `742` |
| `{{$random.int, min, max}}` | Random integer in range | `{{$random.int, 1, 100}}` → `57` |
| `{{$random.number, min, max}}` | Random float in range | `{{$random.number, 0.5, 9.5}}` → `4.73` |
| `{{$random.string}}` | 16-character alphanumeric string | `aB3kR9mPqX2wNv7L` |
| `{{$random.string, length}}` | String of given length (1–256) | `{{$random.string, 32}}` |
| `{{$random.bool}}` | `true` or `false` | `true` |
| `{{$random.enum, a, b, c}}` | Random pick from the list | `b` |
| `{{$random.name}}` | Random full name | `Jennifer Garcia` |
| `{{$random.email}}` | Random email address | `jennifer.garcia482@example.com` |

### Hashing

| Variable | Description |
|----------|-------------|
| `{{$hash.md5, input}}` | MD5 hash (hex) |
| `{{$hash.sha1, input}}` | SHA-1 hash (hex) |
| `{{$hash.sha256, input}}` | SHA-256 hash (hex) |
| `{{$hash.sha512, input}}` | SHA-512 hash (hex) |
| `{{$hmac.sha256, input, key}}` | HMAC-SHA256 (hex) |
| `{{$hmac.sha512, input, key}}` | HMAC-SHA512 (hex) |
| `{{$hmac.md5, input, key}}` | HMAC-MD5 (hex) |
| `{{$hmac.sha1, input, key}}` | HMAC-SHA1 (hex) |

### Encoding and Decoding

| Variable | Description |
|----------|-------------|
| `{{$encode.base64, input}}` | Base64 encode |
| `{{$encode.base64url, input}}` | Base64url encode |
| `{{$encode.url, input}}` | URL percent-encode |
| `{{$encode.html, input}}` | HTML entity encode |
| `{{$decode.base64, input}}` | Base64 decode |
| `{{$decode.url, input}}` | URL percent-decode |

### String Operations

| Variable | Description |
|----------|-------------|
| `{{$regex.match, input, pattern, flags}}` | First regex match |
| `{{$regex.replace, input, pattern, replacement, flags}}` | Regex replace |
| `{{$json.escape, input}}` | Escape a string for embedding in JSON |
| `{{$json.minify, input}}` | Minify a JSON string |

## Response Variables

Reference data from the most recently completed response:

| Variable | Description | Example output |
|----------|-------------|----------------|
| `{{$response.body.field}}` | JSON body field | Value of `field` |
| `{{$response.body.data[0].id}}` | Nested field with array index | `42` |
| `{{$response.body}}` | Entire response body | `{"token":"..."}` |
| `{{$response.headers.content-type}}` | Response header (case-insensitive) | `application/json` |
| `{{$response.status}}` | HTTP status code | `200` |
| `{{$response.statusText}}` | Status text | `OK` |
| `{{$response.duration}}` | Response time in milliseconds | `152` |
| `{{$response.size}}` | Response size in bytes | `1024` |

## Named Response Variables (Collection Runner)

In the Collection Runner, reference a specific request's response by name:

```
{{Login.$response.body.token}}
{{Login.$response.status}}
{{CreateUser.$response.body.id}}
```

Names are case-sensitive and must match the request name exactly. If the named request has not run yet, the placeholder is left unresolved.

## Cookie Variables

Reference a cookie value by name:

```
{{$cookie.sessionId}}
{{$cookie.csrfToken}}
```

The cookie is looked up in the active cookie jar, matched by domain and path against the request URL.

## Script-Set Variables

Scripts can write variables using `nt.setVar()`. Values set in a pre-request script are available for substitution in that same request. Values set in a post-response script are available in all subsequent requests in a collection run.

```javascript
// Pre-request: set a variable for use in this request
nt.setVar('requestId', nt.uuid());

// Post-response: extract a token for subsequent requests
nt.setVar('authToken', nt.response.json().token);
```
