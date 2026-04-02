---
title: Environments & Variables
description: Define variables per environment and use substitution across your requests.
---

Environments let you switch between configurations (dev, staging, production) without modifying your requests.

## Variable Substitution

Use `{{variableName}}` syntax in URLs, query params, headers, and request body:

```
GET {{baseUrl}}/api/users
Authorization: Bearer {{token}}
```

## Dynamic Variables

Nouto includes built-in dynamic variables:

| Variable | Description |
|---|---|
| `{{$uuid.v4}}` | Random UUID v4 |
| `{{$timestamp.unix}}` | Current Unix timestamp |
| `{{$timestamp.iso}}` | Current ISO 8601 timestamp |
| `{{$random.int, 0, 1000}}` | Random integer in range |

## Response References

Reference data from previous responses:

```
{{$response.body.token}}
```
