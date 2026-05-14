---
title: GraphQL
description: Send GraphQL queries and mutations over HTTP, and test GraphQL subscriptions over WebSocket.
---

Nouto supports GraphQL in two ways. Queries and mutations are sent as HTTP requests with the **GraphQL** body type. Subscriptions use the separate **GraphQL Subscription** protocol mode over WebSocket with the `graphql-ws` protocol.

## Queries and Mutations

1. Create a new request or open an existing one.
2. In the **Body** tab, select **GraphQL** from the body type dropdown.
3. Enter the GraphQL endpoint URL (e.g., `https://api.example.com/graphql`).
4. Write your query in the editor.
5. Click **Send**.

```graphql
query GetUser($id: ID!) {
  user(id: $id) {
    name
    email
    role
  }
}
```

Nouto sends the request as JSON with a `query` field, optional `variables`, and optional `operationName`. The request uses the normal HTTP request pipeline, so headers, auth, variables, scripts, assertions, proxy, SSL settings, redirects, and history work the same way they do for other HTTP requests.

## Variables

Click **Variables** below the query editor to open the variables panel. Enter variables as a JSON object:

```json
{
  "id": "42"
}
```

Variables are merged into the request body at send time. Use `{{envVariable}}` syntax inside the JSON to reference environment variables.

## Operation Name

If your document contains multiple named operations, enter the operation name in the **Operation** field to specify which one to execute. Leave it blank to use the single operation in the document.

## Schema Introspection

Click the schema icon in the toolbar (or **Fetch Schema**) to introspect the API. Nouto sends a standard introspection query to the endpoint and builds a local type map.

Once loaded, the schema panel shows all available types, queries, mutations, and subscriptions with field descriptions. Click any type or field to insert it into the query editor.

Authentication headers from the Auth tab are included in the introspection request.

## Subscriptions

Create a GraphQL Subscription request from the protocol selector when you need to test a subscription operation. Nouto opens a persistent WebSocket connection using the `graphql-ws` protocol. Events appear in the message log as they arrive. Click **Disconnect** to close the connection.

```graphql
subscription OnOrderUpdated($orderId: ID!) {
  orderUpdated(id: $orderId) {
    status
    updatedAt
  }
}
```

## Authentication

GraphQL over HTTP uses the same auth system as HTTP requests. Configure the auth type in the **Auth** tab and Nouto attaches credentials to queries, mutations, and schema introspection requests.

## Code Generation

Open the code generation panel to generate a snippet for the current GraphQL request. GraphQL subscriptions are not exported through HTTP code generation.
