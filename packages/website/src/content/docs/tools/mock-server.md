---
title: Mock Server
description: Run a local mock server in Nouto to test against defined routes with custom responses, path parameters, and latency simulation.
sidebar:
  order: 4
---

Nouto includes a built-in mock server that runs locally. Define routes with custom responses, path parameters, and latency simulation, then point your frontend at `http://localhost:<port>` to develop against predictable, offline-capable endpoints.

## Opening the Mock Server

Open it from the **Command Palette** (`Ctrl+Shift+P` > "Start Mock Server") or from the sidebar tools menu.

## Defining Routes

Click **Add Route** to create a new mock route. Each route has:

| Field | Description | Example |
|-------|-------------|---------|
| **Enabled** | Toggle the route on/off | Checkbox |
| **Method** | HTTP method to match | `GET`, `POST`, `PUT` |
| **Path** | URL path with optional `:param` syntax | `/users/:id` |
| **Status Code** | HTTP status to return | `200`, `404` |
| **Response Body** | Response payload (supports `{{param}}` substitution) | `{"userId": "{{id}}"}` |
| **Response Headers** | Custom headers | `Content-Type: application/json` |
| **Latency** | Simulated delay range in ms | Min: `100`, Max: `500` |
| **Description** | Optional note | `Returns a user by ID` |

### Path Parameters

Routes support Express-style path parameters:

```
/users/:id              → matches /users/42
/users/:userId/posts/:postId  → matches /users/5/posts/10
```

Captured values can be substituted into the response body:

```json
{"userId": "{{id}}", "name": "Mock User"}
```

### Latency Simulation

Set **Min** and **Max** values. The server picks a random delay in that range for each request. Set both to `0` for instant responses.

### Route Matching

Routes are matched top to bottom (first match wins). Only enabled routes participate. Unmatched requests return `404` with a JSON error body.

## Starting and Stopping

1. Set the **Port** (default: `3000`).
2. Click **Start Server**. The status badge shows "Running on :3000".
3. Click **Stop Server** to shut down.

CORS headers (`Access-Control-Allow-Origin: *`) are added to all responses automatically.

## Request Log

The **Request Log** tab shows incoming requests in real time:

| Column | Description |
|--------|-------------|
| Time | Request timestamp |
| Method | HTTP method (color-coded) |
| Path | Requested URL path |
| Matched Route | Which route handled it |
| Status | Response status code |
| Duration | Total time including latency |

The log keeps the last 100 requests.

## Importing from Collections

Click **Import from Collection** to convert existing saved requests into mock routes. The importer extracts the URL path, uses the HTTP method, and sets a default `200` response. Nested folders are processed recursively.

## Persistence

Routes and port configuration are saved to your workspace and persist across restarts. The server itself does not auto-start; you must click Start each time.
