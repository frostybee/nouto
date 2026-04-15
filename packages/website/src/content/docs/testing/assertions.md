---
title: Assertions
description: Validate API responses automatically with Nouto's GUI assertion engine, without writing any code.
sidebar:
  order: 0
---

Assertions let you define expected conditions on a response and evaluate them automatically after each request. The result appears inline in the request panel and in the response panel as a pass/fail list. No scripting required.

## Accessing Assertions

Open a request and click the **Tests** tab. The tab shows a count badge when assertions are defined, for example "Tests (3)".

Click **Add Test** to create a new assertion row.

## Assertion Structure

Each assertion has four fields:

| Field | Description |
|-------|-------------|
| **Checkbox** | Enable or disable the assertion without deleting it |
| **Target** | What to test (status, body, JSONPath, header, etc.) |
| **Property** | Context-dependent input, such as a JSONPath expression or header name |
| **Operator** | How to compare the actual value to the expected value |
| **Expected** | The value to compare against |

## Targets

| Target | Property field | Description |
|--------|---------------|-------------|
| **Status Code** | (none) | The HTTP response status code |
| **Response Time** | (none) | Request duration in milliseconds |
| **Response Size** | (none) | Response body size in bytes |
| **Response Body** | (none) | Full response body as a string |
| **JSON Path** | JSONPath expression (e.g., `$.data[0].name`) | A value extracted from the JSON response body |
| **Header** | Header name (case-insensitive) | A response header value |
| **Content-Type** | (none) | Value of the `Content-Type` header |
| **JSON Schema** | (none) | Validates the response body against a JSON Schema you provide in the Expected field. |
| **Set Variable** | JSONPath expression | Extracts a value and stores it as an environment variable. |

## gRPC Targets

The following targets are available when the request protocol is **gRPC**:

| Target | Property field | Description |
|--------|---------------|-------------|
| **gRPC Status Name** | (none) | The gRPC status code name (e.g., `OK`, `NOT_FOUND`, `UNAVAILABLE`) |
| **gRPC Trailer** | Trailer key | A value from the gRPC response trailers |
| **Stream Msg Count** | (none) | Total number of messages received in a streaming call |
| **Stream Message** | Index or index + JSONPath | A specific stream message by index, or a field within it. Use `0` for the first message, or `0.$.field` to extract a field with JSONPath. |

## Operators

| Operator | Symbol | Notes |
|----------|--------|-------|
| equals | `=` | Numeric-aware comparison |
| not equals | `!=` | |
| contains | `contains` | Substring match |
| not contains | `!contains` | |
| starts with | `startsWith` | |
| ends with | `endsWith` | |
| greater than | `>` | Numeric |
| less than | `<` | Numeric |
| greater than or equal | `>=` | Numeric |
| less than or equal | `<=` | Numeric |
| exists | `exists` | Value is not null or undefined (no Expected input) |
| not exists | `!exists` | Value is null or undefined (no Expected input) |
| is type | `isType` | JSON type check: `string`, `number`, `boolean`, `array`, `object`, `null` |
| is JSON | `isJSON` | The value is parseable JSON (no Expected input) |
| count | `count` | Array length or object key count |
| matches | `regex` | JavaScript regular expression |
| any item equals | `anyItemEquals` | At least one array item equals the expected value |
| any item contains | `anyItemContains` | At least one array item contains the expected string |
| any item starts with | `anyItemStartsWith` | At least one array item starts with the expected string |
| any item ends with | `anyItemEndsWith` | At least one array item ends with the expected string |

## Set Variable

**Set Variable** is a special target that extracts a value from the response and stores it in an environment variable. It does not produce a pass/fail result.

- **Property**: JSONPath expression pointing to the value to extract (e.g., `$.data.token`)
- **Variable Name**: the environment variable name to set (e.g., `authToken`)

After the request runs, the extracted value is available as `{{authToken}}` in subsequent requests. In the Collection Runner, Set Variable assertions run in order, so you can chain requests: extract a login token in one request and use it in the next.


## Results

### In the Request Panel

After sending a request, each assertion row shows a green checkmark or red cross. Failed assertions expand to show the actual value received. The Tests tab header shows a summary like "3/5 passed".

### In the Response Panel

A **Tests** tab appears in the response section alongside Body, Headers, and Cookies. It shows:

- A summary bar: "X/Y tests passed"
- A per-assertion list with pass/fail icons and the actual value for failures

### In the Collection Runner

The runner results table shows an assertion badge per request (e.g., "3/4"). Click a row to expand and see individual assertion details for that request.

## Examples

### Validate status and speed

```
Status Code  =        200
Response Time <       500
```

### Check a JSON field exists and has the right type

```
JSON Path  $.data        exists
JSON Path  $.data.users  isType   array
JSON Path  $.data.total  >        0
```

### Extract a token for use in subsequent requests

```
Set Variable  $.token  (variable name: authToken)
```

In the next request, set the Authorization header to `Bearer {{authToken}}`.

### Validate a gRPC streaming call

```
gRPC Status Name   =       OK
Stream Msg Count   >=      3
Stream Message     0.$.id  exists
```

## Persistence

Assertions are saved as part of the request in your collection. They are included in Postman export and restored on Postman import.
