---
title: Exporting
description: Export Nouto collections and folders in Nouto or Postman v2.1 format, export several collections at once, and export requests as HAR.
sidebar:
  order: 6
---

Export a collection to share it, keep a copy, or open it in another tool. Use the Nouto format to move collections between Nouto installations with every setting intact. Use the Postman format for people who use Postman. To save all your Nouto data at once, including environments and history, use [Backup and restore](/import-export/backup-restore) instead.

## Export a collection

Right-click a collection in the sidebar, select **Export**, and choose a format:

- **Postman Collection** writes a Postman Collection v2.1 file.
- **Nouto Collection** writes a `.nouto.json` file in the Nouto format.
- **OpenAPI Spec** generates an OpenAPI document from the collection. See [Generate OpenAPI from collections](/openapi/generate-from-collections).

## Export a folder

Right-click a folder and select **Export**. In VS Code, Nouto writes the folder as a Postman Collection v2.1 file. In the desktop app, Nouto writes it in the Nouto format.

## Export several collections

1. Click **Import / Export** in the Collections toolbar.
2. Select **Bulk Export to Postman** or **Bulk Export as Nouto**.
3. Select the collections to include, then click the export button, for example **Export 3 Collections**.

The result depends on the format and platform:

| Option | VS Code | Desktop app |
|--------|---------|-------------|
| **Bulk Export as Nouto** | One file with the selected collections | One file with every collection, whatever you selected |
| **Bulk Export to Postman** | One file with the selected collections in a `collections` array | One Postman file per collection, with a save dialog for each |

Postman imports one collection per file. To move several collections from VS Code to Postman, export them one at a time with **Export** > **Postman Collection**.

## Export as HAR

In VS Code, run **Nouto: Export as HAR** and select a collection. Nouto writes one HAR 1.2 entry per request, without the folder structure. Each entry has the method, the URL with enabled query parameters, enabled headers, and the body. Auth settings and responses aren't included. The desktop app has no HAR export.

## Nouto format

A Nouto export is a JSON copy of the collection with every setting: folders, requests, auth and auth inheritance, headers, collection and folder variables, scripts, assertions, and notes. The file starts with `"_format": "nouto"`, which is how **Import Collection** recognizes it.

When you import a Nouto export, Nouto gives every collection, folder, and request a new ID. You can import the same file twice without conflicts. See [Nouto export files](/import-export/from-other#nouto-export-files).

## Postman format

A Postman export contains:

- Folders and requests, with each request's method, URL, query parameters, headers, body, and description
- Collection-level auth, headers, and variables
- Folder-level auth
- Basic, Bearer Token, and API Key auth. VS Code also exports OAuth 2.0 settings.

A Postman export leaves out scripts, assertions, auth inheritance, folder-level headers and variables, and per-request settings such as timeouts and proxies. Other auth types are exported as no auth. Use the Nouto format when you need these.
