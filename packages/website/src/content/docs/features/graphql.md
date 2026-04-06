---
title: GraphQL
description: Send GraphQL queries, mutations, and subscriptions with Nouto's dedicated GraphQL editor, including schema introspection and variable support.
---

Nouto includes a dedicated GraphQL mode with a query editor, variables panel, operation name support, schema introspection, and subscription support over WebSocket.

## Setting Up a GraphQL Request

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

Nouto sends the request as `POST` with `Content-Type: application/json` and a body of `{"query": "...", "variables": {...}}`.

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

For `subscription` operations, Nouto opens a persistent WebSocket connection using the `graphql-ws` protocol. Events appear in the message log as they arrive. Click **Disconnect** to close the connection.

```graphql
subscription OnOrderUpdated($orderId: ID!) {
  orderUpdated(id: $orderId) {
    status
    updatedAt
  }
}
```

## Authentication

GraphQL requests use the same auth system as HTTP requests. Configure Bearer, Basic, API Key, OAuth 2.0, or any other supported type in the Auth tab. The credentials are attached to every query, mutation, and introspection request.

## Code Generation

Switch to the **Code** tab to generate a code snippet for the current GraphQL request in any of the 11 supported languages.
