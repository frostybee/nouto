---
title: Server-Sent Events (SSE)
description: Connect to SSE endpoints and monitor event streams in real time.
---

Nouto supports Server-Sent Events for testing streaming endpoints. Connect to any SSE endpoint and watch events arrive in a live log, with event type, data, and timing displayed for each entry.

## Opening an SSE Request

Create a new request and select **SSE** from the protocol selector in the URL bar.

## Connecting

Enter the SSE endpoint URL (e.g., `https://api.example.com/events`) and click **Connect**. Nouto opens a persistent `text/event-stream` connection and the status indicator turns green.

Headers from the **Headers** tab are included in the request. Use them to pass auth tokens or other required headers:

```
Authorization: Bearer {{authToken}}
Accept: text/event-stream
```

Query parameters from the **Params** tab are appended to the URL as usual.

## Event Log

Incoming events appear in the log as they arrive. Each entry shows:

- **Event type** (from the `event:` field, or `message` if unset)
- **Data** (the `data:` payload)
- **ID** (from the `id:` field, if present)
- **Timestamp** of receipt

JSON data payloads are pretty-printed automatically.

## Disconnecting

Click **Disconnect** to close the connection. The event log is preserved until you connect again or close the request.

## Authentication

SSE uses standard HTTP for the initial request, so all authentication methods work: Bearer, Basic, API Key, and OAuth 2.0. Set them in the **Auth** tab and they are included in the connection request.
