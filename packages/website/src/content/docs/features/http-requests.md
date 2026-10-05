---
title: HTTP requests
description: Build and send HTTP requests in Nouto, with standard and custom methods, request tabs for every part of the request, and a tabbed response viewer.
---

The request editor builds and sends HTTP requests. The URL bar holds the method and URL. The tabs below it hold everything else: parameters, headers, body, auth, tests, scripts, per-request settings, and notes.

## Create a request

Click **New Request** at the top of the sidebar, or press `Ctrl+N`. To create another kind of request, click the arrow next to **New Request** and pick GraphQL, GraphQL subscription, WebSocket, SSE, or gRPC.

## Choose a method

Select the method from the dropdown to the left of the URL. The dropdown lists `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, and `OPTIONS`.

To use a method that isn't listed, select **Custom...** at the bottom of the dropdown and type the method name. Method names can contain uppercase letters, digits, hyphens, and underscores, and must start with a letter.

## Request tabs

The tabs below the URL bar are listed in this table, in the order they appear:

| Tab | Contents |
|-----|----------|
| **Query** | Query parameters as key-value pairs. Hidden when the body type is GraphQL. See [Query and path parameters](/building-requests/params). |
| **Path** | Values for path parameters in the URL |
| **Headers** | Request headers, with suggestions for standard header names and values. See [Headers](/building-requests/headers). |
| **Body** | Request body: JSON, Text, XML, Form Data, URL Encoded, Binary, or GraphQL. See [Body types](/building-requests/body-types). |
| **Auth** | Authentication for this request, or inheritance from its collection or folder. See [Authentication](/authentication). |
| **Tests** | Assertions that check the response automatically. See [Assertions](/testing/assertions). |
| **Scripts** | Pre-request and post-response JavaScript. See [Scripts](/testing/scripts). |
| **Settings** | Per-request SSL, proxy, timeout, and redirect settings |
| **Examples** | Saved example responses. Shown only for requests saved in a collection. See [Response examples](/response/response-examples). |
| **Notes** | Markdown notes saved with the request. See [Notes](/building-requests/notes). |

`Ctrl+1` through `Ctrl+7` switch to the Query, Headers, Auth, Body, Tests, Scripts, and Notes tabs. See [Keyboard shortcuts](/settings/keyboard-shortcuts).

## Send a request

Click **Send**, or press `Ctrl+Enter`. Before sending, Nouto resolves every `{{variable}}` reference in the request. See [Variable substitution](/variables/variable-substitution).

While the request is in flight, a cancel button replaces **Send**. Click it or press `Escape` to cancel the request.

The **Code** button next to **Send** shows the request as code in other languages and tools. See [Code generation](/tools/code-generation).

## Read the response

The response panel shows the status code, response time, and size, followed by these tabs:

| Tab | Contents |
|-----|----------|
| **Body** | The response body, formatted for JSON, XML, HTML, images, and other content types |
| **Headers** | Request and response headers |
| **Cookies** | Cookies sent with the request and cookies set by the response |
| **Redirects** | Each redirect hop. Shown only when the request was redirected. |
| **Timing** | Time spent on DNS lookup, TCP connection, TLS handshake, time to first byte, and download |
| **Timeline** | A step-by-step log of the request, including where it failed |
| **Tests** | Assertion results. Shown only after assertions run. |
| **Scripts** | Script output. Shown only when a script produced output. |

If the request fails before a response arrives, for example on a DNS or connection error, the panel hides the **Headers** and **Cookies** tabs and shows the error. See [Response viewer](/response/response-viewer) for details on each tab.

## Save a request

To save a new request, click **Save** next to **Send** and pick a collection or folder. After that, press `Ctrl+S` to save changes. See [Collections](/features/collections).
