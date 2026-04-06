---
title: Mock Server
description: Run a local mock server in Nouto to test against defined routes with custom responses, path parameters, and latency simulation.
---

The built-in mock server runs locally and serves defined routes with custom responses. Point your frontend or other services at `http://localhost:<port>` to develop and test against predictable, offline-capable endpoints without needing a real backend.

## Opening the Mock Server

Open it from the **Command Palette** (`Ctrl+Shift+P` > "Start Mock Server") or from the sidebar tools menu.

## Defining Routes

Click **Add Route** to create a new mock route. Each route has:

| Field | Description | Example |
|-------|-------------|---------|
| **Enabled** | Toggle the route on/off without deleting it | Checkbox |
| **Method** | HTTP method to match | `GET`, `POST`, `PUT` |
| **Path** | URL path with optional `:param` placeholders | `/users/:id` |
| **Status Code** | HTTP status to return | `200`, `404` |
| **Response Body** | Payload (supports `{{param}}` substitution) | `{"id": "{{id}}"}` |
| **Response Headers** | Custom headers | `Content-Type: application/json` |
| **Latency** | Simulated delay range in ms | Min: `100`, Max: `500` |

## Path Parameters

Routes support Express-style path parameters. Captured values are available for substitution in the response body:

```
Route:    /users/:id
Response: {"userId": "{{id}}", "name": "Mock User"}

Request:  GET /users/42
Response: {"userId": "42", "name": "Mock User"}
```

## Starting and Stopping

1. Set the **Port** (default: `3000`).
2. Click **Start Server**.
3. Click **Stop Server** to shut down.

CORS headers (`Access-Control-Allow-Origin: *`) are added to all responses automatically.

## Importing from Collections

Click **Import from Collection** to convert existing saved requests into mock routes. The importer extracts the URL path and HTTP method, and sets a default `200` response. Nested folders are processed recursively.

## Request Log

The **Request Log** tab shows incoming requests in real time with method, path, matched route, response status, and duration.

For the full reference including route matching rules and persistence details, see [Mock Server](/tools/mock-server).
