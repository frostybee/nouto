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

| Variable | Example Output |
|---|---|
| `{{$uuid.v4}}` | `a1b2c3d4-e5f6-7890-abcd-ef1234567890` |
| `{{$timestamp.unix}}` | `1741795200` |
| `{{$timestamp.iso}}` | `2026-03-12T12:00:00.000Z` |
| `{{$random.int, 0, 1000}}` | `427` |

## Response References

Access values from the most recent response:

```
{{$response.body.token}}
{{$response.body.data[0].id}}
```

## Folder Variables

Variables defined at the folder level override environment variables for all requests within that folder.

## Resolution Order

1. Folder variables (most specific)
2. Environment variables
3. Dynamic variables (built-in)
