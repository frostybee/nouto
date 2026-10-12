# Test Servers

Local test servers for developing and testing Nouto's protocol support. Each server is a standalone Node.js app.

## Quick Start

```bash
cd test-servers/<server>
npm install
node server.js
```

---

## GraphQL Subscriptions (`gql-sub-test`)

**Port:** `ws://localhost:4000`

A GraphQL subscription server using the `graphql-ws` protocol. Useful for testing Nouto's GraphQL subscription feature.

```bash
cd gql-sub-test
npm install
node server.js
```

**Available subscriptions:**

| Subscription | Description |
|---|---|
| `subscription { countdown(from: 10) }` | Counts down from N to 0 (1 event/sec) |
| `subscription { tick }` | Emits an incrementing number every 2 seconds |

**Query (for testing the connection):**

| Query | Description |
|---|---|
| `{ hello }` | Returns `"world"` |

---

## WebSocket Echo (`ws-echo-test`)

**Port:** `ws://localhost:4001`

A WebSocket echo server that sends back whatever you send, with metadata. Useful for testing Nouto's WebSocket client.

```bash
cd ws-echo-test
npm install
node server.js
```

**Behavior:**
- Sends a welcome message on connect
- Echoes back any message with timestamp and length metadata
- Sends a ping every 5 seconds

---

## gRPC (`grpc-test`)

**Ports:** `localhost:50051` (plaintext) and `localhost:50052` (TLS)

A gRPC test server with three services and server reflection on both ports. It covers every call type (unary, server streaming, client streaming, and bidirectional streaming), metadata, auth, error codes, and TLS.

```bash
cd grpc-test
npm install
node server.js
```

**Services:**

### `helloworld.Greeter`

| Method | Description |
|---|---|
| `SayHello({ name })` | Returns a greeting |
| `SayHelloWithMetadata({ name })` | Echoes back metadata keys |

### `test.TestService`

| Method | Description |
|---|---|
| `Echo({ message, repeatCount, blob })` | Echoes message, optionally repeated; `blob` is a `bytes` field echoed back, so clients should show it base64-encoded |
| `Ping({})` | Returns server status and time |
| `RequireAuth({})` | Requires `Authorization` metadata, returns UNAUTHENTICATED without it |
| `TriggerError({ code, message })` | Returns any gRPC error code (for testing error handling) |
| `Countdown({ from, intervalMs })` | Server streaming: sends `from`, `from - 1`, ... `1`, one message every `intervalMs` (default 5 messages, 200 ms apart), then ends |
| `Sum(stream { value })` | Client streaming: adds up every `value` and returns `{ total, count }` after the client ends its side. In Nouto, click **Start Stream**, **Send** for each extra message, then **Commit**. |
| `Chat(stream { text })` | Bidirectional streaming: replies `You said: <text>` to each message, and ends the stream after the client ends its side |
| `WrapAny({ payload })` | Echoes a `google.protobuf.Any` back unchanged, with its type URL, to check `Any` rendering in both directions |

### `users.UserService` (complex schema with nested messages, enums, maps, arrays)

| Method | Description |
|---|---|
| `CreateUser({ user, sendWelcomeEmail, notifyEmails })` | Creates a user |
| `GetUser({ id })` | Gets a user (seeded: id=`"1"` Alice, id=`"2"` Bob) |
| `ListUsers({ pageSize, filterStatus, minPriority, searchQuery })` | Lists users with filtering |
| `UpdateUser({ id, user, updateMask })` | Partial update with field mask |
| `DeleteUser({ id, softDelete })` | Hard or soft delete |

Server reflection is enabled, so Nouto can auto-discover all services without loading `.proto` files manually.

`SayHello`, `Echo`, `Countdown`, `Sum` and `Chat` send the trailers `x-grpc-test-call` and `x-grpc-test-server`, which show in Nouto's Timeline under **Received trailers**.

`node dump-reflection.js [address] [symbol]` prints the file descriptors the server returns over reflection: file names, dependencies, messages, and every field type reference. Use it when a client cannot build a schema from reflection. grpc-js sends files with an empty dependency list and relative type names, which strict loaders reject.

### TLS

Port `50052` serves the same services over TLS with a certificate for `localhost`, signed by a test CA in `certs/`. To connect from Nouto, set the address to `localhost:50052`, open the **TLS** tab, select **Use TLS**, and set **CA Certificate** to the full path of `test-servers/grpc-test/certs/ca.crt`.

The files in `certs/` are for local testing only. To replace them, run `certs/generate.sh` (needs OpenSSL 1.1.1 or later, for example from Git Bash). If they're missing, the server starts without the TLS port.
