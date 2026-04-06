---
title: Collections
description: Organize requests into nested collections with folders, shared auth, headers, and variables.
---

Collections let you group related requests and share configuration across them. Every request can inherit authentication, headers, and variables from its parent folder or collection, so you configure credentials once and all requests pick them up automatically.

## Creating a Collection

Click **New Collection** in the sidebar, or right-click the sidebar background and select **New Collection**. Enter a name and press Enter.

## Adding Requests and Folders

Right-click a collection or folder to open the context menu:

- **New Request**: create a new unsaved request inside the collection or folder
- **New Folder**: add a subfolder to group related requests
- **Import**: import requests from Postman, cURL, OpenAPI, or HAR directly into the collection

## Saving a Request

Press `Ctrl+S` while editing any request to save it to a collection. If the request has not been saved before, a dialog asks which collection and folder to place it in.

## Organizing

- **Drag and drop** to reorder requests and folders in the sidebar
- **Rename**: double-click a name, or right-click and select Rename
- **Delete**: right-click and select Delete

## Folder Configuration

Folders can define shared settings that apply to all requests inside them. Right-click a folder and open its settings to configure:

- **Auth**: a shared auth method (Bearer, Basic, OAuth 2.0, etc.) that child requests inherit
- **Headers**: headers merged into every request in the folder
- **Variables**: key-value pairs that override environment variables for requests in the folder

Collections support the same configuration at the collection level, one level above folders.

## Auth Inheritance

Requests default to inheriting auth from their nearest configured ancestor. Each request and folder can choose to **Inherit**, set its **Own** auth, or send **None**. This lets you set a single Bearer token on a collection and have every request use it, while individual requests can override when needed. See [Auth Inheritance](/authentication/inheritance) for details.

## Collection Runner

Right-click a collection or folder and select **Run All** to open the Collection Runner. It executes all requests in order, shows real-time progress, and produces a results table with pass/fail status per assertion. Supports data-driven testing with CSV and JSON files, and exports results to JUnit XML for CI/CD pipelines. See [Collection Runner](/testing/collection-runner) for details.

## Import and Export

Right-click a collection and select **Export** to save it as Nouto native format, Postman v2.1, OpenAPI, or HAR. To import, use the sidebar import button or the Command Palette.

See [Exporting](/import-export/exporting) and [From Postman](/import-export/from-postman) for details.
