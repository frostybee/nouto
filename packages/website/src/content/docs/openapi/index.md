---
title: OpenAPI editor
description: Edit OpenAPI 3.0, 3.1, and 3.2 specifications in YAML or JSON with completions, linting, quick fixes, an outline, and a documentation preview.
sidebar:
  order: 0
---

Nouto edits OpenAPI 3.0, 3.1, and 3.2 specifications written in YAML or JSON. As you type, it validates the document, suggests valid properties, offers quick fixes, and updates a rendered documentation preview. The VS Code extension and the desktop app share the same validation, linting, completion, and outline logic. They differ in how you open, save, and lay out specs.

## Open a spec in VS Code

The extension adds OpenAPI support to the standard VS Code text editor. It treats a file as an OpenAPI spec when the file uses the YAML, JSON, or JSON with Comments language mode and its root `openapi` field holds a 3.x version. Other files, including Swagger 2.0 documents, get no OpenAPI features.

To start without an existing file, run one of these commands from the Command Palette:

- **Nouto: New OpenAPI Specification** opens an untitled OpenAPI 3.1 YAML document with a sample server and path.
- **Nouto: Open Example OpenAPI Specification** opens the Swagger Petstore example as OpenAPI 3.0 or 3.2.

While an OpenAPI file is active, the editor title bar shows three buttons: **Open OpenAPI Preview**, **Generate Collection from OpenAPI**, and **Open OpenAPI Documentation in Browser**. A **Nouto: Try It** CodeLens above each operation opens that operation as an unsaved request. See [Try an operation in VS Code](#try-an-operation-in-vs-code).

The **OpenAPI Outline** view in the Nouto sidebar shows the structure of the active spec. See [Outline navigator](/openapi/outline).

## Try an operation in VS Code

Click **Nouto: Try It** above an operation's method key, such as `get:`. Nouto opens the operation as an unsaved request in the editor column beside the spec. It doesn't send the request: review it, then click **Send**.

Nouto builds the request from the spec text in the editor, including unsaved changes:

- The URL is the first server URL followed by the operation's path. Nouto takes the servers from the operation, then from the path item, then from the document, and replaces server variables with their `default` values.
- Path parameters such as `{id}` stay in the URL. Fill in their values on the **Path** tab. Nouto prefills a value when the parameter has an `example` or a schema `default`.
- Query parameters, headers, the request body, and auth come from the operation. When the operation lists several security alternatives, Nouto applies the first one.
- Cookie parameters are skipped.

When part of the operation doesn't convert cleanly, Nouto shows a warning that lists each problem. For example, a spec with no servers gives a URL that contains only the path, and a server URL without a scheme needs a base URL before the request can run.

Webhooks have no **Try It** lens. To try operations from the rendered documentation instead, see [Send requests from the documentation](/openapi/preview#send-requests-from-the-documentation).

## Open a spec in the desktop app

Click the **OpenAPI** button in the left rail. With no spec open, the view offers **New Spec**, **Open File…**, **Open Example**, and up to 10 recently opened files. **Open File…** accepts `.yaml`, `.yml`, and `.json` files. A file without an `openapi: 3.x` field still opens, with a warning that it does not look like an OpenAPI 3.x document.

Each spec opens in its own tab, and each tab keeps its own undo history, cursor position, scroll offset, and folded regions. A dot marks a tab with unsaved changes. Closing that tab asks you to confirm before the changes are discarded.

The toolbar above the editor has these buttons:

| Button | Action |
|--------|--------|
| **Generate Collection** | Create a collection from the spec, as described in [Preview](/openapi/preview#toolbar) |
| **Toggle Preview** | Show or hide the documentation preview beside the editor |
| **Format Document** | Reformat the whole document with Prettier as one undo step |
| **New Spec** | Open an untitled OpenAPI 3.1 document with a sample server and path |
| **Open File** | Open a spec from disk |
| **Open Example** | Open the Swagger Petstore example as OpenAPI 3.0 or 3.2 |
| **Save** | Save the spec. The shortcut is `Ctrl+S` (`Cmd+S` on macOS) |
| **Save As…** | Save the spec to a new file |

The outline sits to the left of the editor. The editor colors follow the app theme and update when you switch themes. The editor font follows the app's editor font settings.

## Supported OpenAPI versions

Nouto reads the version from the root `openapi` field and adapts to it:

- Completions only offer properties that exist in the declared version. For example, `webhooks` appears from 3.1, and `$self` and `additionalOperations` appear from 3.2.
- Meta-schema validation uses the official JSON Schema for the declared version.
- The outline shows a **Webhooks** group for 3.1 and later.

Nouto treats a later 3.x version that it does not know yet, such as `3.3.0`, as 3.2. An information diagnostic reports the fallback, and Nouto skips meta-schema validation for that document so that fields added in the newer version are not flagged as errors.

## Configure the editor

Open **Settings** and select **OpenAPI**. The section has toggles for **Enable OpenAPI IntelliSense**, **Resolve external $refs**, **Enable OpenAPI linting**, and **Sort outline alphabetically**, followed by a severity control for each lint rule. IntelliSense, external `$ref` resolution, and linting are on by default. Alphabetical sorting is off. In VS Code, the **OpenAPI Settings** button in the OpenAPI Outline title bar opens this section directly.

## Editor features

- [IntelliSense](/openapi/intellisense): completions, hover documentation, and go to definition
- [Linting](/openapi/linting): 65 rules in 11 groups, each with a configurable severity, 41 of them with a one-click quick fix
- [Diagnostics and quick fixes](/openapi/diagnostics): structural checks, meta-schema validation, and the fixes for them
- [Preview](/openapi/preview): rendered documentation with Swagger UI or RapiDoc
- [Outline navigator](/openapi/outline): a tree of the spec's sections with add and delete actions
- [External references](/openapi/external-refs): `$ref` values that point into other local files
- [Generate from collections](/openapi/generate-from-collections): create an OpenAPI document from a collection or a HAR file
