---
title: From cURL, OpenAPI, HAR & More
description: Import from Thunder Client, cURL, OpenAPI specs, HAR files, and Nouto native format.
sidebar:
  order: 4
---

## Thunder Client

Use the command **Import Thunder Client** and select your Thunder Client data directory.

## cURL

Use the command **Import from cURL** (`Ctrl+U`) and paste your cURL command. Nouto parses it into a request with method, URL, headers, auth, and body.

You can also paste a cURL command directly into the URL bar. Nouto detects it and offers to import it automatically.

## OpenAPI / Swagger

Use the command **Import OpenAPI Specification** and select a `.json` or `.yaml` OpenAPI v3 spec file, or enter a URL to fetch the spec remotely. Nouto creates a collection with one request per endpoint, grouped by tag into folders. Path parameters like `{id}` are converted to `{{id}}` syntax.

## HAR Files

Use the **Import Collection** button or the HAR import command. Nouto reads HAR 1.2 files (from Chrome DevTools, Firefox DevTools, Charles Proxy, etc.) and recreates each recorded request. Requests are grouped by domain into folders. Body types are auto-detected from content type.

## Nouto Native Format

Use **Import Nouto Collection** to import collections previously exported in Nouto's own format. All IDs are regenerated on import to avoid conflicts with existing collections.
