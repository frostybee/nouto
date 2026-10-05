---
title: API key
description: Send an API key as a request header or query parameter with Nouto's API Key auth type.
sidebar:
  order: 3
---

The API Key auth type sends a key and value either as an HTTP header or as a URL query parameter. Your API's documentation tells you which placement and which name to use.

## Set up an API key

1. Open a request and select the **Auth** tab.
2. Select **API Key** from the **Type** dropdown.
3. In **Key**, enter the header name or query parameter name, for example `X-API-Key` or `api_key`.
4. In **Value**, enter the API key.
5. Under **Add to**, select **Header** or **Query Param**. **Header** is the default.

A line below the fields shows how Nouto will send the key, for example `X-API-Key: <value>` or `?api_key=<value>`.

## Header placement

With **Header** selected, Nouto adds the key as a request header:

```http
GET /api/data HTTP/1.1
Host: api.example.com
X-API-Key: your-api-key-here
```

## Query parameter placement

With **Query Param** selected, Nouto appends the key to the URL when it sends the request:

```http
GET /api/data?api_key=your-api-key-here HTTP/1.1
Host: api.example.com
```

The parameter doesn't appear in the URL bar or on the **Query** tab.

:::caution
A key in the URL can end up in server access logs and proxy logs. Use **Header** placement when your API accepts it.
:::

## Use variables for the key

Both **Key** and **Value** resolve `{{variable}}` references at send time:

| Field | Example | Resolved value |
|-------|---------|----------------|
| Key | `{{API_HEADER_NAME}}` | `X-API-Key` |
| Value | `{{API_KEY}}` | `sk-abc123...` |

The **Value** field shows its content in plain text. Store the key in a [secret variable](/variables/secrets) and reference it here.

## Copy as cURL

To get a cURL command, right-click a saved request in the sidebar and select **Copy as cURL**. Nouto resolves variables in the copied command, so the command can contain the real key.

With **Header** placement, the key becomes a header:

```bash
curl \
  https://api.example.com/data \
  -H \
  'X-API-Key: your-api-key-here'
```

With **Query Param** placement, the key is part of the URL:

```bash
curl \
  'https://api.example.com/data?api_key=your-api-key-here'
```

## Postman collections

When you import a Postman collection, requests that use Postman's `apikey` auth keep their key name, value, and placement. When you export a collection in Postman format, API Key auth is written in Postman's `apikey` format.
