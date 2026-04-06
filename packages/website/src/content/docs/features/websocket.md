---
title: WebSocket
description: Connect to WebSocket servers and send and receive messages in real time.
---

Nouto includes a dedicated WebSocket mode for testing real-time APIs. Connect to any WebSocket endpoint, send text or JSON messages, and monitor incoming events in a live message log.

## Opening a WebSocket Request

Create a new request and select **WebSocket** from the protocol selector in the URL bar. The request editor changes to WebSocket mode.

## Connecting

Enter the WebSocket URL (e.g., `wss://ws.example.com/chat`) and click **Connect**. The status indicator shows **Connecting**, then turns green when the handshake is complete.

Headers from the **Headers** tab are sent as part of the initial upgrade request. Use them for API keys, session tokens, or any other header your server requires.

## Sending Messages

Type a message in the input field at the bottom of the panel. Select **Text** or **JSON** from the format toggle:

- **Text**: sends the message as a plain string
- **JSON**: validates and formats the content as JSON before sending

Press `Ctrl+Enter` or click **Send** to transmit.

```json
{
  "type": "subscribe",
  "channel": "orders",
  "token": "{{authToken}}"
}
```

Variable substitution (`{{variable}}`) works in message content.

## Message Log

Incoming and outgoing messages appear in the log in chronological order. Each entry shows:

- Direction (sent or received) with a color indicator
- Timestamp
- Message size
- Content (expandable for long messages)

Click any message to expand it. JSON messages are pretty-printed automatically.

## Disconnecting

Click **Disconnect** to close the connection cleanly. The status indicator returns to gray.

## Authentication

For protocols that use token-based auth over WebSocket, you can pass the token in a header (e.g., `Authorization: Bearer {{token}}`), as a query parameter in the URL (e.g., `wss://ws.example.com?token={{token}}`), or as the first message after connecting.
