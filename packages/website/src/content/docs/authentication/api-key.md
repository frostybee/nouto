---
title: API Key
description: Send an API key as a request header or query parameter using Nouto's API Key auth type.
---

API Key authentication lets you send a key as either a custom HTTP header or a URL query parameter. The placement depends on what your API requires.

<!-- screenshot: authentication/api-key-fields.png -->
![API Key fields: Key name, Value, and Add to selector showing Header and Query Param options](/screenshots/authentication/api-key-fields.png)

## Setup

1. Open a request and click the **Auth** tab.
2. Select **API Key** from the type dropdown.
3. Fill in the three fields:
   - **Key**: the header name or query parameter name (e.g., `X-API-Key`, `api_key`)
   - **Value**: your API key
   - **Add to**: choose **Header** or **Query Param**

## Header Placement

The key is sent as a custom HTTP header:

```
GET /api/data HTTP/1.1
Host: api.example.com
X-API-Key: your-api-key-here
```

Most APIs that use header-based keys follow naming conventions like `X-API-Key`, `X-Auth-Token`, or `Authorization`. Check your API's documentation for the expected header name.

## Query Parameter Placement

The key is appended to the request URL:

```
GET /api/data?api_key=your-api-key-here HTTP/1.1
Host: api.example.com
```

The URL bar in Nouto updates to show the appended parameter when you switch to **Query Param** placement.

## Variable Support

Both the key name and value accept `{{variable}}` syntax:

| Field | Example | Resolved value |
|-------|---------|----------------|
| Key | `{{API_HEADER_NAME}}` | `X-API-Key` |
| Value | `{{API_KEY}}` | `sk-abc123...` |

This works with environment variables, global variables, `.env` file variables, and dynamic variables.

## cURL Export

API Key auth is included when you copy a request as cURL.

**Header placement:**
```bash
curl https://api.example.com/data \
  -H 'X-API-Key: your-api-key-here'
```

**Query parameter placement:**
```bash
curl 'https://api.example.com/data?api_key=your-api-key-here'
```

## Postman Compatibility

- **Import**: Postman collections using `apikey` authentication are imported with key name, value, and placement preserved.
- **Export**: Nouto API Key auth exports to the standard Postman `apikey` auth format for round-trip compatibility.

## Security

When sending an API key over unencrypted HTTP to a non-localhost URL, Nouto shows a security warning. Query parameter placement exposes the key in server logs, browser history, and referrer headers. Prefer header placement when security matters.
