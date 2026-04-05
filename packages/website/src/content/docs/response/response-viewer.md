---
title: Response Viewer
description: Inspect HTTP responses in Nouto with syntax highlighting, body views, headers, cookies, and copy/download actions.
sidebar:
  order: 0
---

The response panel appears below the request editor after a request completes. It shows the status, timing, size, and full response body with syntax highlighting.

<!-- screenshot: response/response-viewer-full.png -->
![Full response panel showing the status badge, response time, size, body with JSON syntax highlighting, and the copy-as dropdown open](/screenshots/response/response-viewer-full.png)

## Status Bar

The top of the response panel shows three values at a glance:

- **Status code**: color-coded by range (green for 2xx, amber for 3xx/4xx, red for 5xx) with the status text
- **Response time**: duration in milliseconds from request send to last byte received
- **Size**: response body size in bytes or KB

## Body View

The body viewer renders the response with syntax highlighting matched to the content type. The content type badge in the toolbar identifies the detected format.

### Supported Content Types

| Format | Rendering |
|--------|-----------|
| JSON | Syntax-highlighted with code folding, tree view, JSONPath filter |
| XML | Syntax-highlighted |
| HTML | Syntax-highlighted source, plus rendered preview toggle |
| Image (PNG, JPG, GIF, SVG, WebP) | Inline preview with zoom controls |
| PDF | Inline preview |
| Binary | Hex dump with byte offsets |
| Plain text | Syntax-highlighted as plain text |

### Pretty / Raw Toggle

Use the **Pretty** / **Raw** buttons to switch between formatted (indented) and minified output. The **Copy** button copies whichever mode is active.

### Code Folding

Click the fold arrow next to any JSON object or array to collapse it. A badge shows the number of hidden children. Use the fold depth buttons in the toolbar to collapse or expand all content to a specific depth level (1–5), or use **Expand All** / **Collapse All**.

### JSONPath Filter

The filter bar lets you run a JSONPath expression against the response body. Matching results replace the view. The match count appears as a badge.

```
$[?(@.status == "active")]
$..email
$.data[0:5]
```

### JSON Tree View

For JSON responses, click the **Tree** button to switch to the interactive tree view. See [JSON Explorer](/response/json-explorer) for the full feature set.

### HTML Preview

HTML responses show a **Preview** / **Source** toggle. Preview renders the HTML in a sandboxed frame. Source shows the raw HTML with syntax highlighting.

### Image Preview

Image responses display inline with zoom controls. Use **Fit** to scale the image to the panel, **100%** for actual size, and **+**/**-** for 25% increments. A checkered background indicates transparent areas.

## Response Tabs

The response panel has multiple tabs:

| Tab | Content |
|-----|---------|
| **Body** | Response body with all viewer features |
| **Headers** | Response headers as key-value pairs |
| **Cookies** | Cookies received in this response vs. cookies sent with the request |
| **Tests** | Assertion and script test results (appears after running) |
| **Scripts** | Script execution output and console log (appears after running) |
| **Timing** | Per-phase timing breakdown (see [Timing Breakdown](/response/timing-breakdown)) |

## Toolbar Actions

| Action | Description |
|--------|-------------|
| **Copy** | Copy the response body (respects Pretty/Raw mode and active filter) |
| **Copy as cURL** | Copy the request that produced this response as a cURL command |
| **Download** | Save the response body to a file (format detected from content type) |
| **Compare** | Open the diff view against the previous response |
| **Open in JSON Explorer** | Open the JSON Explorer panel with this response loaded |
| **Search** (`Ctrl+F`) | Search within the response body |
| **Go to Line** (`Ctrl+G`) | Jump to a specific line number |

## Clickable URLs

URLs inside JSON string values are underlined. Hovering shows an **Open** button (opens in system browser) and a **Copy** button.

## Minimap

For large responses (roughly 50+ lines), a minimap appears on the right edge of the body viewer. Click anywhere on the minimap to scroll to that position.

## Error Display

When a request fails, the response panel shows an error panel instead of a body:

| Error type | Icon | Examples |
|-----------|------|---------|
| DNS | Search icon (red) | `getaddrinfo ENOTFOUND` |
| Connection | Plug icon (red) | `ECONNREFUSED`, port not listening |
| SSL | Lock icon (red) | Certificate expired, self-signed |
| Timeout | Watch icon (amber) | Request exceeded the configured timeout |
| Network | Globe icon (amber) | General network failures |

Each error panel includes a short description and a suggestion for how to resolve it.

## Saving Response Bodies

By default, Nouto saves response bodies to history. You can disable this in **Settings > General > Save Response Bodies** to reduce storage usage. Entries saved without a body show an empty response panel when reopened from history.
