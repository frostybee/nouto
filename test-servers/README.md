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

**Port:** `localhost:50051` (plaintext, no TLS)

A gRPC test server with three services and server reflection enabled. Useful for testing Nouto's gRPC client (reflection auto-discovery, all call types, error handling, auth).

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
| `Echo({ message, repeatCount })` | Echoes message, optionally repeated |
| `Ping({})` | Returns server status and time |
| `RequireAuth({})` | Requires `Authorization` metadata, returns UNAUTHENTICATED without it |
| `TriggerError({ code, message })` | Returns any gRPC error code (for testing error handling) |

### `users.UserService` (complex schema with nested messages, enums, maps, arrays)

| Method | Description |
|---|---|
| `CreateUser({ user, sendWelcomeEmail, notifyEmails })` | Creates a user |
| `GetUser({ id })` | Gets a user (seeded: id=`"1"` Alice, id=`"2"` Bob) |
| `ListUsers({ pageSize, filterStatus, minPriority, searchQuery })` | Lists users with filtering |
| `UpdateUser({ id, user, updateMask })` | Partial update with field mask |
| `DeleteUser({ id, softDelete })` | Hard or soft delete |

Server reflection is enabled, so Nouto can auto-discover all services without loading `.proto` files manually.
