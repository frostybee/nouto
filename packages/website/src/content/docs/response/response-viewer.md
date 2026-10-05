---
title: Response viewer
description: Read HTTP responses in Nouto's response panel, with the status line, response tabs, a body viewer for JSON, XML, HTML, images, and files, and copy and save actions.
sidebar:
  order: 0
---

The response panel shows the result of the last request you sent from a request tab. It has a status line, a row of tabs, and a body viewer that adapts to the content type.

## Status line

The top of the response panel shows:

- The status code and status text. The color shows the status class: green for 2xx, orange for 3xx, and red for 4xx and 5xx.
- The response time in milliseconds.
- The response size. In the VS Code extension, hover over the size to see the sizes of the response headers and body and of the request headers and body.

While a request is in flight, the status line reads `Sending request...`. When the response body is downloading, it shows the bytes received so far, and a progress bar appears in the panel.

The status line also has these buttons:

| Button | Action |
|--------|--------|
| **Save as Example** | Saves the response as an example of the request. Shown only for requests saved in a collection. See [Response examples](/response/response-examples). |
| Layout toggle | Places the response panel below or beside the request editor. The default shortcut is `Alt+L`. |

The **Decrease font size** and **Increase font size** buttons at the right of the tab row change the text size in the response panel. Click the number between them, or double-click **Decrease font size**, to reset the size.

## Response tabs

The response panel has these tabs. Some appear only when they have content.

| Tab | Contents | Shown |
|-----|----------|-------|
| **Body** | The response body. See [Body viewer](#body-viewer). | Always |
| **Headers** | The request URL, remote address, and HTTP version, then the request headers and response headers. The badge counts request and response headers. | When the server responded |
| **Cookies** | **Sent Cookies** from the request and **Response Cookies** from `Set-Cookie` headers, with their attributes. The badge counts sent and received cookies. | When the server responded |
| **Redirects** | Each redirect hop with its URL, status, and duration | When the request followed redirects |
| **Timing** | Per-phase timing and the timeout and redirect settings used. See [Timing breakdown](/response/timing-breakdown). | Always |
| **Timeline** | A step-by-step log of the request, including the step where it failed | Always |
| **Tests** | Assertion and test results, labeled with the number passed, for example `Tests 3/4` | After tests run |
| **Scripts** | Output from pre-request and post-response scripts | After a script runs |

When a request fails before the server responds, for example on a DNS or connection error, the panel hides the **Headers**, **Cookies**, and **Redirects** tabs.

## Body viewer

The body viewer picks a display from the response's `Content-Type` header. A body that parses as JSON is treated as JSON whatever its content type. A badge at the end of the body toolbar shows the detected language, such as `JSON` or `TEXT`.

| Content type | Display |
|--------------|---------|
| JSON: `application/json`, `+json`, or any body that parses as JSON | Highlighted text with folding, or a tree |
| XML: `text/xml`, `application/xml`, `+xml` | Highlighted text, or a tree |
| HTML: `text/html` | Rendered preview, or highlighted source |
| CSS, JavaScript, YAML, Markdown | Highlighted text |
| Images: `image/*` | The image, with zoom controls |
| PDF: `application/pdf` | A file card with **Open Externally** and **Save As** buttons |
| Audio, video, `application/octet-stream`, `application/zip`, `application/gzip` | A file card with the content type, the size, and a **Save As** button |
| Other types | Plain text |

### Text and tree view

JSON and XML responses have **Text view** and **Tree view** buttons in the body toolbar. The tree view shows the body as a collapsible tree, with a button that expands or collapses every node. For a JSON tree with table view, search, filters, and more, click **Open in JSON Explorer**. See [JSON Explorer](/response/json-explorer).

### Pretty and raw JSON

In the text view of a JSON response, **Pretty** indents the JSON and **Raw** shows it compact on one line.

When the response panel is narrow, the toolbar moves **Pretty**, **Raw**, folding, search, **Go to Line**, the JSONPath filter, and **Compare** into a **More actions** menu.

### Folding

Click the arrow in the gutter next to an object or array to fold it. A folded block shows how many keys or items it hides.

In the **Pretty** view of a JSON response, the folding button in the toolbar expands or collapses everything. The arrow next to it opens a menu that folds the body to **Level 1** through **Level 5**.

### Search and go to line

Click **Search** or press `Ctrl+F` to search the body text. Click **Go to Line** to jump to a line number.

### JSONPath filter

In the text view of a JSON response, click **JSONPath filter** to filter the body with a JSONPath expression. The body shows only the selected values, and a badge shows the number of matches. If the expression is invalid, the filter bar shows the error.

```text
$[?(@.status == "active")]
$..email
$.data[0:5]
```

Below the body, a path bar shows the JSONPath of the value at the cursor, with a button to copy it.

### JSON statistics

Click **JSON statistics** to show a summary of the JSON body: the number of keys, objects, and arrays, the maximum depth, and the number of strings, numbers, booleans, and nulls. The [JSON Explorer](/response/json-explorer#statistics) has a more detailed statistics panel.

### HTML preview

HTML responses open in **Preview**, which renders the page in a sandboxed frame. The frame allows scripts, so JavaScript in the page runs. Click **View Source** to see the HTML as highlighted text.

### Image preview

Images have zoom controls above them. **Fit** scales the image to the panel, **100%** shows its actual size, and **-** and **+** zoom out and in by 25%, from 25% to 500%. A checkered background shows transparent areas.

### Links in JSON

URLs inside JSON string values are underlined. Hover over a URL to show a menu with **Open in browser**, **Copy to clipboard**, and **Create new request**.

### Minimap

The text view can show a minimap on its right edge. Click the minimap to scroll to that part of the body. The **Minimap** setting controls when it appears:

| Option | Behavior |
|--------|----------|
| **Auto (show for large documents)** | Shows the minimap for bodies longer than 50 lines. This is the default. |
| **Always** | Shows the minimap for every body |
| **Never** | Hides the minimap |

Find the setting in **Settings** > **General** in the VS Code extension, and in **Settings** > **Interface** in the desktop app. Bodies larger than 512 KB or longer than 5,000 lines never show a minimap.

The [JSON Explorer](/response/json-explorer#find-your-way-around) has a separate minimap that maps the tree instead of the text.

## Body toolbar actions

The body toolbar also has these actions:

| Action | Effect |
|--------|--------|
| **Open in JSON Explorer** | Opens the JSON body in the [JSON Explorer](/response/json-explorer). JSON responses only. |
| **JSON Schema actions** | **Copy as JSON Schema** copies a schema inferred from the body. In the VS Code extension, **Add as component schema** adds the schema under `components/schemas` in an open OpenAPI document. JSON responses only. |
| **Compare with previous response** | Shows a side-by-side diff with the previous response. JSON responses only. See [Response diff](/response/response-diff). |
| **Toggle word wrap** | Wraps long lines in the text view |
| **Copy to clipboard** | Copies the body in the current **Pretty** or **Raw** format. A JSONPath filter doesn't change what is copied. |
| **Save response to file** | Saves the body to a file. The default file name has the form `METHOD-path-YYYY-MM-DD-HH-MM.ext`, for example `GET-users-2026-10-05-14-30.json`. |

To copy the request as a cURL command, right-click the saved request in the sidebar and select **Copy as cURL**.

## Errors

When a request fails before the server responds, the body shows the error message as text.

In the VS Code extension, an error panel above the message names the kind of failure, shows the host that failed when it is known, and suggests a fix. The status line shows the same message with an icon. Click **Retry** to send the request again, or the copy button to copy the error details.

| Kind | Message |
|------|---------|
| `TIMEOUT` | `Request timed out` |
| `DNS` | `Could not resolve hostname` |
| `SSL` | `SSL/TLS certificate error` |
| `CONNECTION` | `Connection refused` or `Connection was reset` |
| `NETWORK` | `Network unreachable` or `Network error` |
| `UNKNOWN` | The original error message |

The desktop app shows the error message in the body without the error panel.
