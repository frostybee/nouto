---
title: Response examples
description: Save representative responses with a request in Nouto, view them later without sending the request, and use them when generating OpenAPI specs.
sidebar:
  order: 4
---

A response example is a response that you save with a request, such as a typical success or a known error. You can view it later without sending the request again. Examples are available only for requests saved in a collection.

## Save an example

1. Send the request.
2. Click **Save as Example** (the save icon) in the status line of the response panel.
3. Edit the name if needed. It defaults to the status code and text, for example `200 OK`.
4. Press `Enter` or click **Save**. Press `Escape` to cancel.

Nouto saves the status, headers, body, size, and response time with the request in its collection.

The response body can be at most 200 KB. For a larger body, Nouto shows `Response body is too large to save as an example` instead of the name field. **Save as Example** doesn't appear when the request failed before the server responded.

## View an example

Open the request's **Examples** tab. The tab label shows how many examples the request has, for example `Examples (2)`. Each row shows the status code, the name, and the date it was saved.

Click an example to show it in the response panel. A banner reads `Viewing example:` followed by the example's name, and only the **Body** and **Headers** tabs are available. Click the close button in the banner to return to the last real response.

## Delete an example

In the **Examples** tab, click the trash icon on the example's row, then click **Yes** to confirm.

## Examples in OpenAPI specs

When you [generate an OpenAPI spec from a collection](/openapi/generate-from-collections), Nouto turns each saved example into a response with a schema inferred from the example's body.
