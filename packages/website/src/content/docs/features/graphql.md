---
title: GraphQL
description: Send GraphQL queries and mutations over HTTP, explore a schema with introspection, and test subscriptions over WebSocket.
---

Nouto sends GraphQL queries and mutations as HTTP requests with the **GraphQL** body type. Subscriptions use a separate **GraphQL Subscription** request type that connects over WebSocket.

## Send a query or mutation

1. Click the arrow next to **New Request** in the sidebar and select **New GraphQL Request**. The request uses `POST` and the **GraphQL** body type. To convert an existing request, open its **Body** tab and select **GraphQL**.
2. Enter the endpoint URL, for example `https://api.example.com/graphql`.
3. Write the operation in the **Query** editor.
4. Click **Send**.

```graphql
query GetUser($id: ID!) {
  user(id: $id) {
    name
    email
    role
  }
}
```

Nouto sends a JSON body with a `query` field, plus `variables` and `operationName` when you set them, and adds `Content-Type: application/json` unless you set that header yourself. A GraphQL request is a normal HTTP request, so headers, auth, scripts, assertions, proxy, SSL, and redirect settings apply as they do to any other request. The **Query** tab for URL parameters is hidden for GraphQL requests.

Click **Format** above the editor to reformat the query.

## Add variables

Enter variables as a JSON object in the **Variables (JSON)** editor below the query:

```json
{
  "id": "42"
}
```

You can use `{{variables}}` from the active environment inside the JSON. Nouto resolves them before it sends the request.

If the JSON is invalid, the editor shows **Invalid JSON** and Nouto sends the request without variables.

## Choose an operation

When the document contains more than one named operation, enter the one to run in **Operation Name (optional)**. Leave the field empty when the document has a single operation.

## Explore the schema

Click **Fetch Schema** in the GraphQL toolbar. Nouto sends the standard introspection query to the request URL and opens the schema explorer.

The explorer lists **Queries**, **Mutations**, **Subscriptions**, and **Types**. Use the search box to filter types and fields. Click a type to see its fields, arguments, enum values, input fields, and interfaces. Click a field name to copy it. Click **Hide Explorer** or **Show Explorer** to toggle the panel.

After the schema loads, the query editor suggests field names as you type.

The introspection request includes the request's enabled headers and its auth settings. VS Code applies Bearer, Basic, and header-based API Key auth. The desktop app applies Bearer and Basic auth.

:::caution
Fetch Schema sends the URL, headers, and auth values as written. `{{variables}}` aren't resolved for the introspection request, so use literal values when you fetch the schema.
:::

## Test a subscription

A GraphQL Subscription request connects over WebSocket with the `graphql-transport-ws` subprotocol used by the [graphql-ws](https://github.com/enisdenjo/graphql-ws) library.

1. Click the arrow next to **New Request** and select **New GraphQL Subscription**.
2. Enter the WebSocket endpoint, for example `ws://localhost:4000/graphql`.
3. Write the subscription in the **Query** editor.
4. Click **Subscribe** in the URL bar.

```graphql
subscription OnOrderUpdated {
  orderUpdated {
    status
    updatedAt
  }
}
```

Nouto sends a `connection_init` message with an empty payload, waits up to 10 seconds for `connection_ack`, then sends the subscription. While the subscription is active, the status shows `subscribed` in VS Code and `connected` in the desktop app.

Events appear in the log below the editor with a timestamp and a type badge:

| Type | Meaning |
|------|---------|
| `data` | A result from the server. JSON is pretty-printed. |
| `error` | An error message from the server |
| `complete` | The server ended the subscription. VS Code logs this event. The desktop app closes the subscription without logging it. |

Click **Unsubscribe** to close the connection. Click **Clear** to empty the event log.

Subscription requests have no Headers or Auth tab. Nouto sends cookies from the active [cookie jar](/tools/cookie-jars) that match the URL with the WebSocket upgrade request. Subscriptions don't reconnect automatically.

## Generate code

Code generation works for GraphQL queries and mutations the same way as for other HTTP requests. See [Code generation](/tools/code-generation). The **Generate Code** panel isn't available for subscription requests.
