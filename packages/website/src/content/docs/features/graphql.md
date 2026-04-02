---
title: GraphQL
description: GraphQL queries, mutations, and subscriptions with schema explorer.
---

Nouto includes full GraphQL support with a dedicated editor mode.

## Features

- **Query editor** with syntax highlighting
- **Variables editor** for query variables
- **Operation name** support for multi-operation documents
- **Schema explorer** to browse types and fields
- **Subscriptions** via WebSocket (graphql-ws protocol)

## Usage

1. Set the request body type to **GraphQL**
2. Write your query in the editor
3. Add variables in the variables panel (optional)
4. Click **Send**

```graphql
query GetUser($id: ID!) {
  user(id: $id) {
    name
    email
  }
}
```
