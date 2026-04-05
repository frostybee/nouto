---
title: Exporting
description: Export Nouto collections to Postman, OpenAPI, HAR, or Nouto native format.
sidebar:
  order: 5
---

Export your collections for sharing, backup, or use in other tools. Right-click a collection in the sidebar and select **Export**, then choose a format.

<!-- screenshot: import-export/export-dialog.png -->
![Export dialog showing format options: Postman, OpenAPI, HAR, Nouto Native, and Bulk Export](/screenshots/import-export/export-dialog.png)

## Export Formats

| Format | Extension | Use for |
|--------|-----------|---------|
| **Postman** | `.json` | Sharing with Postman users, v2.1 compatible |
| **OpenAPI v3** | `.json` | API documentation, spec-first workflows |
| **HAR 1.2** | `.har` | Network recording replay, browser DevTools compatibility |
| **Nouto Native** | `.json` | Full-fidelity backup, transfer between Nouto installations |
| **Bulk Export** | `.json` | Export all collections at once |

## Postman Export

Exports to Postman Collection v2.1 format. Folder structure, auth settings, headers, body, query params, and variables are preserved. You can import the file directly into Postman.

## OpenAPI Export

Generates an OpenAPI v3 specification from the collection. Each request becomes an operation. Folders map to tags.

## HAR Export

Exports to HAR 1.2 standard format. Includes full request details, timing data, cookies, and redirect chains. Compatible with Chrome DevTools, Firefox DevTools, Charles Proxy, Postman, and Insomnia.

## Nouto Native Export

The native format preserves everything: assertions, scripts, auth inheritance, collection variables, notes, and all request configuration. Use this for backup or to move collections between machines.

All IDs are regenerated on import to avoid conflicts.

## Bulk Export

Use **Export All Collections** from the Command Palette to export every collection into a single file.

## Round-Trip Fidelity

Collections exported in Nouto native format and re-imported retain full fidelity: folders, requests, auth, headers, variables, assertions, scripts, and notes are all preserved.

For Postman format, most data is preserved. Nouto-specific features like assertions, scripts, and auth inheritance are not included in the Postman export since Postman does not support them in its collection schema.
