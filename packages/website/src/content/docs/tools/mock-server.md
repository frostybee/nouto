---
title: Mock server
description: Run a local mock server in Nouto with routes, path parameters, simulated latency, and a live request log.
sidebar:
  order: 4
---

The mock server answers HTTP requests on a local port with responses you define. Point a frontend or a test suite at `http://localhost:<port>` to develop against fixed responses while the real API is unavailable.

## Open the mock server

In VS Code, click **Mock Server** in the sidebar's action bar, or run **Nouto: Open Mock Server** from the Command Palette.

In the desktop app, click **Mock Server** in the left rail.

## Add a route

Click **+ Add Route**. Nouto adds a `GET /new-route` route that returns `200` with the body `{}`. Edit the route in its row:

- The checkbox enables or disables the route.
- The method dropdown sets the HTTP method to match.
- The path field sets the URL path, with optional `:param` segments, for example `/users/:id`.
- The number field sets the status code to return, from `100` to `599`.

Click the arrow at the end of the row to show more fields:

- **Description** is an optional note.
- **Response Body** is the text the route returns.
- **Latency (ms)** sets a minimum and maximum delay.

Click **×** to remove a route.

:::note
The route editor has no field for response headers. In the desktop app, routes return `Content-Type: application/json`. In VS Code, only routes created with **Import from Collection** send that header.
:::

### Path parameters

A path segment that starts with `:` matches any single segment:

```text
/users/:id                    matches /users/42
/users/:userId/posts/:postId  matches /users/5/posts/10
```

Use `{{name}}` in **Response Body** to insert the captured value:

```json
{ "userId": "{{id}}", "name": "Mock User" }
```

A request to `/users/42` returns `{ "userId": "42", "name": "Mock User" }`.

### Latency

When **Latency (ms)** has different minimum and maximum values, the server waits a random time in that range before it responds. Equal values give a fixed delay. Leave both at `0` to respond immediately.

### Route matching

The server checks enabled routes from top to bottom and uses the first route whose method and path match. It ignores the query string. A request that matches no route gets a `404` response with a JSON body that names the method and path.

## Start and stop the server

1. Set **Port** to a value from `1024` to `65535`. The default is `3000`.
2. Click **Start Server**. The button stays disabled until at least one route exists. While the server runs, the badge shows `Running on :<port>`.
3. Click **Stop Server** to shut it down.

You can edit routes while the server runs, and changes apply to the next request. The **Port** field is locked until you stop the server.

### Calls from a browser

Every response includes `Access-Control-Allow-Origin: *` and allows all methods and headers, so a browser app on another origin can call the server.

In VS Code, the server answers every `OPTIONS` preflight request with `204`. In the desktop app, an `OPTIONS` request goes through route matching like any other method. If a browser preflights a path, add an `OPTIONS` route for that path with a `204` status.

## Request log

The **Request Log** tab lists the requests the server received, with these columns:

| Column | Contents |
|--------|----------|
| Time | When the request arrived |
| Method | HTTP method |
| Path | Requested path |
| Matched Route | The route that answered, if any |
| Status | Status code returned |
| Duration | Time to respond, including simulated latency |

The log keeps the last 100 requests. Click **Clear Logs** to empty it.

## Create routes from a collection

Click **Import from Collection** and select a collection. Nouto adds one route for each request in the collection and its folders. Each route uses the request's method and URL path, returns `200` with the body `{}` and `Content-Type: application/json`, and takes the request name as its description. Edit the bodies afterward to return realistic data.

## Saved routes

In VS Code, Nouto saves the routes and the port to `mocks.json` in its storage directory, so they survive a restart. The desktop app keeps routes in memory only. They're lost when you close the app.

The server doesn't start on its own. Click **Start Server** each time you open Nouto.
