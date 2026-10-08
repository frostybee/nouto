---
title: gRPC
description: Call gRPC services with server reflection or .proto files, including unary, server streaming, client streaming, and bidirectional streaming calls.
---

A gRPC request calls a method on a gRPC server. Nouto supports unary, server streaming, client streaming, and bidirectional streaming methods. It loads the service definitions through server reflection or from local `.proto` files and records every event of a call in a timeline.

## Create a gRPC request

Click the arrow next to **New Request** in the sidebar and select **New gRPC Call**. To add the request to a collection or folder, right-click it and select **New Request** > **gRPC**.

Enter the server address in `host:port` format, for example `localhost:50051`, without a scheme. `{{variables}}` in the address are resolved from the active environment.

## Load the schema

Nouto needs the service definitions before you can pick a method. The schema bar shows **No Schema** until you load them.

1. Click **Configure** in the schema bar.
2. Under **Proto Source**, select **Server Reflection** or **Proto Files**.
3. Click **Load Schema**.

When loading succeeds, the bar shows **Schema Loaded** with the source: `Reflection` or the number of proto files. If loading fails, the bar shows **Error** with the message.

### Server reflection

Select **Server Reflection** when the server has the gRPC reflection service enabled. Nouto lists the services through reflection v1 and falls back to v1alpha when the server doesn't implement v1.

The reflection call uses the address, the entries on the **Metadata** tab, and the settings on the **TLS** tab. `{{variables}}` aren't resolved for the reflection call, so use literal values in the address and metadata when you load the schema.

### Proto files

Select **Proto Files** when the server doesn't support reflection.

1. Click **Add Proto Files** and select one or more `.proto` files.
2. If your files import other protos, such as `google/protobuf/timestamp.proto`, click **Add Import Directory** and select the root folder those imports are relative to. Nouto lists the `.proto` files it finds in the folder. Click the `+` next to a file to add it, or **Add all** to add every file.
3. Click **Load Schema**.

## Select a method

Click the **Service / Method** dropdown and select a method. Methods are grouped by service, and streaming methods carry a badge:

| Badge | Call type |
|-------|-----------|
| None | Unary |
| `server stream` | Server streaming |
| `client stream` | Client streaming |
| `bidi` | Bidirectional streaming |

The input and output message types appear below the dropdown. If the **Message** editor is empty or contains `{}`, Nouto fills it with a JSON object that lists every field of the input message with a default value, for example `""` for strings, `0` for numbers, and `[]` for repeated fields.

![The gRPC panel for localhost:50051: Schema Loaded from Reflection, UserService / GetUser selected with its input and output types, and the Message tab with a scaffold for the id field](../../../assets/screenshots/features/grpc-panel.png)

## Write the message

The **Message** tab holds the request message as JSON. The editor uses the input message type to suggest field names and enum values (press `Ctrl+Space`), show field descriptions on hover, and flag fields that don't match the schema. The toolbar has **Format**, **Minify**, copy, and **Wrap** buttons.

`{{variables}}` in the message are resolved from the active environment for the first message and for each message sent on a stream.

You can annotate the message with `//` and `/* */` comments. The editor flags them as JSON errors, but Nouto removes the comments before it encodes the message.

## Add metadata

The **Metadata** tab holds key-value pairs that Nouto sends as gRPC metadata, the gRPC equivalent of HTTP headers. `{{variables}}` work in keys and values.

## Add authentication

Set up auth on the **Auth** tab. Nouto converts these auth types to metadata:

| Auth type | Metadata sent |
|-----------|---------------|
| Bearer Token | `authorization: Bearer <token>` |
| Basic Auth | `authorization: Basic <base64 of username:password>` |
| API Key | The key name and value, when **Add to** is set to **Header** |
| OAuth 2.0 | `authorization: Bearer <access token>`, using the token already fetched on the Auth tab |

Nouto doesn't send the other auth types with gRPC calls. See [Authentication](/authentication/) for setup details.

:::caution
`{{variables}}` in auth fields aren't resolved for gRPC calls. To send a token from an environment variable, set the auth type to **No Auth** and add an `authorization` entry on the **Metadata** tab with a value such as `Bearer {{token}}`.
:::

## Use TLS and mutual TLS

Nouto connects in plaintext by default. To use TLS, open the **TLS** tab and select **Use TLS**. These fields appear:

| Field | Description |
|-------|-------------|
| **CA Certificate** | Path to a CA certificate (`.pem` or `.crt`) used to verify the server |
| **Client Certificate** | Path to the client certificate for mutual TLS |
| **Client Key** | Path to the private key that matches the client certificate |
| **Key Passphrase** | Passphrase for an encrypted private key |

In VS Code, leave **CA Certificate** empty to verify the server against Node.js's default trusted CAs.

:::caution
The desktop app doesn't load the operating system's trusted certificates for gRPC. Set **CA Certificate** whenever **Use TLS** is on in the desktop app, including for servers with publicly trusted certificates. In the desktop app, **Key Passphrase** works only with PKCS#8 encrypted keys (`-----BEGIN ENCRYPTED PRIVATE KEY-----`).
:::

## Set a timeout

Enter a value in **Timeout (ms)** above the tabs to set a deadline for the call. Leave the field empty for no deadline. If the call doesn't finish in time, it fails with `DEADLINE_EXCEEDED` in VS Code and `CANCELLED` in the desktop app.

## Invoke a method

The button in the URL bar depends on the call type:

| Call type | Button |
|-----------|--------|
| Unary | **Invoke** |
| Server streaming | **Stream** |
| Client streaming and bidirectional streaming | **Start Stream** |

The button stays disabled until you've entered an address and selected a method. You can also press `Ctrl+Enter`.

### Control a streaming call

While a stream is open, the URL bar shows **Cancel**, which cancels the call.

For client streaming and bidirectional streaming, **Start Stream** sends the contents of the **Message** editor as the first message, unless the message is empty (`{}`). While the stream is open, the URL bar also shows:

- **Send** sends the current contents of the **Message** editor. Edit the message between sends to vary the payload.
- **Commit** half-closes the client side of the stream, telling the server that no more messages are coming.

## Read the response

The response panel has a status bar and two tabs.

The status bar shows the gRPC status, for example `OK 0`, and the elapsed time in milliseconds. During a stream, it shows **Streaming** and the number of messages received. After you've made more than one call, a dropdown lets you switch between recent calls.

The **Response** tab shows the last message from the server as JSON. If the call fails, it shows the gRPC status name, code, and error message instead.

The **Timeline** tab lists every event of the call in order:

| Event | Description |
|-------|-------------|
| **Connecting to** | The call started. Shows the server address. |
| **Received response metadata** | The server sent its initial metadata |
| **Sent message** | Nouto sent a message |
| **Received response** | The server sent a message |
| **Received trailers** | The server sent its trailing metadata |
| **Error** | The call failed. Shows the status name and code. |
| **Connection complete** | The call finished |

Click an event to expand it. Messages appear as JSON, and metadata and trailers appear as key-value pairs.

## Add assertions

The **Assertions** tab checks the result after each call. gRPC requests support these targets in addition to the standard ones:

| Target | Checks | Property example |
|--------|--------|------------------|
| **gRPC Status Name** | The status name, such as `OK`, `NOT_FOUND`, or `PERMISSION_DENIED` | None |
| **gRPC Trailer** | The value of a trailing metadata key | `grpc-message` |
| **Stream Msg Count** | The number of messages the server sent | None |
| **Stream Message** | One server message, by zero-based index, optionally with a JSONPath | `0.$.token` |

For gRPC calls, the standard targets read these values:

- **Status Code** is the numeric gRPC status code, `0` for `OK`.
- **Response Body** and **JSON Path** read the last server message.
- **Header / Initial Metadata** reads the server's initial metadata.

The **Stream Message** property has the form `<index>` or `<index>.<jsonpath>`. For example, `2.$.items[0].id` reads the `id` of the first item in the third server message.

See [Assertions](/testing/assertions) for operators and examples.

## History and collections

Save gRPC requests to collections and folders like any other request. See [Collections](/features/collections).

In VS Code, each completed call is added to the request history with the address, service, method, and schema source: reflection or the proto file paths. The desktop app doesn't record gRPC calls in history.
