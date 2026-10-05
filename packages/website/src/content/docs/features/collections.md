---
title: Collections
description: Organize Nouto requests into collections and nested folders, and share auth, headers, variables, and scripts across them.
---

A collection groups related requests, and folders inside it can nest to any depth. Collections and folders can carry their own auth, headers, variables, scripts, and tests, so you set them up once instead of on every request.

## Create a collection

Click **New Collection** (the `+` icon) in the Collections toolbar of the sidebar. Enter a name, optionally pick a color and an icon, and click **Create**.

## Add requests and folders

Right-click a collection or folder and choose one of these:

- **New Request** opens a submenu where you pick the request type: HTTP, GraphQL, GraphQL Subscription, WebSocket, SSE, or gRPC.
- **New Folder** adds a subfolder.

## Save a request to a collection

A request that isn't in a collection yet shows a **Save** button next to **Send**. Click it, then pick a collection or folder from the list. You can search the list or create a new collection from it.

After a request is in a collection, press `Ctrl+S` to save your changes. To discard unsaved changes, click **Revert to Saved** next to the save icon.

## Organize the sidebar

- Drag requests, folders, and collections to reorder them or move them between folders.
- To rename a request, right-click it and select **Rename**.
- To rename a collection or folder, or change its color and icon, right-click it and select **Edit...**.
- To copy an item, right-click it and select **Duplicate**.
- To pin a request to the top of the sidebar, right-click it and select **Pin to top**.
- To delete an item, right-click it and select **Delete**.

Deleted collections, folders, and requests move to the **Trash** tab, where you can restore them or delete them permanently. See [Trash & recovery](/tools/trash-recovery).

## Shared settings for collections and folders

Right-click a collection or folder and select **Settings...** to open its settings. The settings have these tabs:

| Tab | Effect on the requests inside |
|-----|-------------------------------|
| **Auth** | Auth that requests can inherit. See [Inherit auth](#inherit-auth). |
| **Headers** | Headers added to every request. When the same header name appears at several levels, the deepest level wins: a folder header replaces a collection header, and a request header replaces both. |
| **Variables** | Variables available to every request. A folder variable replaces a collection variable with the same name. |
| **Scripts** | Pre-request and post-response scripts that run for every request. Collection scripts run first, then folder scripts from the outermost folder in, then the request's own script. |
| **Tests** | Assertions applied to every request, in addition to the request's own assertions |
| **Notes** | Markdown notes about the collection or folder |

Collection and folder variables take precedence over global variables and `.env` file values, but the active environment takes precedence over them. See [Variable substitution](/variables/variable-substitution).

## Inherit auth

A request uses its own auth by default. To use the auth configured on its collection or folder instead, open the request's **Auth** tab and select **Inherit**. Nouto walks up from the request's folder to the collection and uses the first auth it finds. The **No Auth** option sends the request without auth, even if a parent has auth configured.

For example, set a Bearer token on the collection once and select **Inherit** on each request that needs it. See [Auth inheritance](/authentication/inheritance).

## Run a collection

Right-click a collection or folder and select **Run All** to open the Collection Runner. It sends the requests in order and reports assertion results for each one. The runner supports data-driven runs with CSV or JSON files and exports results as JSON, CSV, JUnit XML, or HTML. See [Collection runner](/testing/collection-runner).

## Import and export

To import, click the **Import / Export** button in the Collections toolbar and select **Import Collection**. Nouto detects the file format. See [From Postman](/import-export/from-postman) and [From cURL, OpenAPI, HAR & more](/import-export/from-other) for supported sources.

To export a collection, right-click it, select **Export**, and pick **Postman Collection**, **Nouto Collection**, or **OpenAPI Spec**. See [Exporting](/import-export/exporting).
