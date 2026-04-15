---
title: gRPC
description: Call gRPC services with server reflection or proto files, including unary, server streaming, client streaming, and bidirectional streaming.
---

Nouto includes a dedicated gRPC mode with support for all four call types: unary, server streaming, client streaming, and bidirectional streaming. Load your API schema via server reflection or proto files, get JSON autocomplete based on your message types, and inspect every event in a live timeline.

## Creating a gRPC Request

Create a new request and select **gRPC** from the protocol selector in the URL bar. Enter the server address in `host:port` format (e.g., `localhost:50051`). No `http://` or `grpc://` prefix is needed.

## Schema Configuration

Before selecting a service or method, load the server schema. Click **Configure** in the schema bar to open the configuration panel. Two modes are available:

### Server Reflection

Nouto queries the server's reflection API to discover all available services and methods. This requires the server to have reflection enabled.

Enter any metadata headers needed for the reflection request (authentication tokens, etc.) in the **Metadata** tab, then click **Load Schema**. Nouto tries the v1 reflection protocol first and falls back to v1alpha automatically.

### Proto Files

Load the schema from local `.proto` files when reflection is not available.

- Click **Add File** to pick one or more `.proto` files from disk.
- If your protos import other protos, add the root import directories under **Import Directories**. Nouto scans each directory and lists the discovered `.proto` files. Click **Add All** to include all of them at once.
- Click **Load Schema** to compile and cache the descriptor pool.

Once loaded, the schema bar shows a green status indicator and the service and method selectors become active.

## Service and Method Selection

Use the **Service** and **Method** dropdowns to select which RPC to call. Each method is labeled with its call type:

| Badge | Call type |
|-------|-----------|
| *(none)* | Unary |
| `server stream` | Server streaming |
| `client stream` | Client streaming |
| `bidi` | Bidirectional streaming |

When you select a method, the message editor is pre-populated with a scaffolded JSON object matching the method's input type. All required fields are included with zero values so you can fill them in without consulting the proto definition.

## Sending Messages

The **Message** tab contains a JSON editor for the request payload. The editor provides autocomplete based on the selected method's input schema — press `Ctrl+Space` to trigger suggestions for field names and enum values.

JSON comments (`//` and `/* */`) are supported in the editor and stripped before the message is sent, so you can annotate fields for reference.

Press **Invoke** (or **Send** for streaming) to call the method.

## Metadata

The **Metadata** tab is a key-value editor for gRPC request metadata (the gRPC equivalent of HTTP headers). Use it to pass custom values to the server alongside the call.

`{{variable}}` syntax works in both keys and values.

## Authentication

Configure authentication in the **Auth** tab using any of the supported types — Bearer, Basic, API Key, or OAuth 2.0. Credentials are attached to the call as gRPC metadata headers automatically, so you do not need to add them manually to the Metadata tab.

See [Authentication](/authentication/) for setup details.

## TLS and mTLS

The **TLS** tab controls transport security:

| Field | Description |
|-------|-------------|
| **Enable TLS** | Toggle to use TLS/mTLS instead of plaintext |
| **CA Certificate** | Path to a custom CA certificate (`.pem`) for server verification |
| **Client Certificate** | Path to the client certificate (`.pem`) for mutual TLS |
| **Client Key** | Path to the client private key (`.pem`) |
| **Passphrase** | Passphrase for an encrypted private key |

Leave CA Certificate blank to use the system's trusted certificate store.

## Timeout

Enter a timeout in milliseconds in the **Timeout** field. The call is cancelled with a `DEADLINE_EXCEEDED` status if the server has not responded within the limit. Leave it blank for no deadline.

## Streaming

For streaming call types, the button bar changes to reflect the current state:

- **Send** — transmit the current message to the server (available for client and bidirectional streaming while connected)
- **Commit** — gracefully half-close the client side of the stream, signalling to the server that no more messages will be sent (available for client and bidirectional streaming)
- **Disconnect** — forcefully cancel the stream

You can send multiple messages during a single connection. Edit the message body between sends to vary the payload.

## Response and Timeline

The response panel has two tabs:

### Response

Shows the last server message received, pretty-printed as JSON.

For streaming calls, a counter in the status bar shows the total number of messages received. Use the **Timeline** tab to inspect individual messages.

### Timeline

A chronological log of all events in the call:

| Event type | Description |
|------------|-------------|
| **Connecting** | Call initiated |
| **Initial Metadata** | Response headers (metadata) received from the server |
| **Client Message** | Message you sent |
| **Server Message** | Message received from the server (expandable JSON) |
| **Trailers** | Trailing metadata (status, grpc-status, custom keys) |
| **Error** | Error details if the call failed |
| **Complete** | Call finished cleanly |

Click any event to expand it. Server messages are pretty-printed JSON. Trailers and metadata are shown as key-value pairs.

## Assertions

Open the **Assertions** tab to define automatic checks that run after each call. In addition to the standard assertion targets, gRPC calls support:

| Target | Description | Example value |
|--------|-------------|---------------|
| `grpcStatusMessage` | gRPC status code name | `OK`, `NOT_FOUND`, `PERMISSION_DENIED` |
| `trailer` | Value of a trailing metadata key | Key: `grpc-message` |
| `streamMessageCount` | Total server messages received | `5` |
| `streamMessage` | JSONPath into a specific server message by index | `0.$.token` (first message, `.token` field) |

Standard targets also available: `status` (HTTP-equivalent numeric status), `responseTime`, `body` (last server message), `header`, `jsonQuery`, `setVariable`.

For `streamMessage`, the value format is `<index>.<jsonpath>` — for example, `2.$.items[0].id` queries the `id` field of the first item from the third server message.

See [Assertions](/features/assertions) for operators and examples.

## History and Collections

Completed gRPC calls are saved to the request history automatically. Each history entry records the server address, service, method, and the full schema configuration (reflection settings or proto file paths). Re-opening a history entry restores everything so you can replay or modify the call without reconfiguring the schema.

gRPC requests can be saved to collections and organised into folders like any other request type. See [Collections](/features/collections).
