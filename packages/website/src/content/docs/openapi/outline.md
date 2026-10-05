---
title: Outline navigator
description: Navigate an OpenAPI spec through a tree of its sections, keep the tree in sync with the cursor, and add or delete paths, operations, servers, tags, and components.
sidebar:
  order: 5
---

The outline shows the structure of an OpenAPI spec as a tree. Click a node to move the editor cursor to it. As you move the cursor in the editor, the outline selects the matching node and expands its parents.

Where the outline appears depends on the platform:

- In VS Code, the **OpenAPI Outline** view sits in the Nouto sidebar and follows the active editor. Its title bar has buttons to toggle sorting, refresh the tree, open the preview, and open OpenAPI settings. Its **More Actions** menu opens, creates, saves, or closes a spec, generates a collection, and opens the documentation in a browser.
- In the desktop app, the outline sits to the left of the editor in the OpenAPI view. Each tab keeps its own expanded and collapsed nodes.

## Groups

The tree organizes the spec into these top-level groups:

| Group | Contents |
|-------|----------|
| API title | The `openapi` version and the `info` block. The group is labeled with `info.title` and shows `info.version` beside it, or reads **General** when the spec has no title |
| **Servers** | Server URLs |
| **Security** | Document-level security requirements |
| **Tags** | Operations grouped by tag, as described in [Operations by tag](#operations-by-tag) |
| **Operation ID** | Every operation that has an `operationId`, sorted alphabetically |
| **Paths** | Path items and their operations |
| **Components** | One node for each `components` section the spec defines, such as `schemas`, `parameters`, `responses`, or `securitySchemes` |
| **Webhooks** | Webhook definitions, for OpenAPI 3.1 and later |
| **Referenced files** | Files that external `$ref` values point to. See [External references](/openapi/external-refs#referenced-files-in-the-outline) |

The title, **Servers**, **Security**, **Tags**, **Paths**, and **Components** groups appear even when the spec does not define that section, so their add actions stay available. **Webhooks** appears for every 3.1 or later spec. **Operation ID** appears when at least one operation has an `operationId`, and **Referenced files** appears when the spec contains an external reference and **Resolve external $refs** is on.

## Method colors and icons

Each operation shows a colored method icon: green for GET, yellow for POST, blue for PUT, orange for PATCH, red for DELETE, and purple for HEAD. Other methods, such as OPTIONS, TRACE, and 3.2 `query` or `additionalOperations` entries, have an uncolored icon. Items under **Components** use a different icon for each section, so schemas, parameters, security schemes, and callbacks are easy to tell apart.

## Sorting

The outline lists items in document order by default. To sort alphabetically, turn on **Sort outline alphabetically** in **Settings** > **OpenAPI**. In VS Code, the sort button in the OpenAPI Outline title bar toggles the same setting.

Sorting applies to paths, tags, servers, webhooks, and component items. Operations inside a path or tag keep document order, and the **Operation ID** group is always alphabetical.

## Operations by tag

The **Tags** group lists tags in this order:

1. Tags declared in the spec's root `tags` array, in declaration order
2. Tags that operations use but the root `tags` array does not declare
3. An **Untagged** node for operations with no tags, always last

An operation with several tags appears under each of them. When sorting is on, declared and undeclared tags are sorted together, and **Untagged** stays last.

## Parse failures

When the document has a syntax error, the outline keeps the last tree it built and adds an error row at the top. The row reads **Outline is out of date**, followed by the first syntax error and its line number. If no tree was built yet, the row reads **Can't build the outline**. Click the error to jump to it in the editor. The tree updates once the document parses again.

## Context menu

Right-click a node to see the actions available for it:

| Node | Actions |
|------|---------|
| **Paths** | Add a path |
| A path or webhook | Add an operation, delete the path or webhook |
| An operation | Try It, delete the operation |
| **Servers** | Add a server |
| A server | Delete the server |
| **Tags** | Add a tag |
| A declared tag | Delete the tag |
| **Security** | Add a security requirement |
| A security requirement | Delete the requirement |
| **Components** | Add a schema, parameter, response, example, request body, header, link, callback, or path item. Add an API Key, HTTP Bearer, HTTP Basic, OAuth2 Authorization Code, or OpenID Connect security scheme |
| A `components` section | Add an item to that section |
| A component | Delete the component |
| **Webhooks** | Add a webhook |

**Try It** opens the operation as an unsaved request with its method, URL, parameters, headers, auth, and body filled in. Every node that maps to a location in the spec also offers **Copy JSON Pointer**, which copies the node's RFC 6901 pointer, such as `/paths/~1pets/get`.

Add and delete actions are unavailable while the spec has error-level diagnostics: VS Code hides them, and the desktop app shows them disabled. Fix the errors to use them again. **Try It** and **Copy JSON Pointer** stay available.
