---
title: From Postman
description: Switch from Postman to Nouto. Import your collections and environments and pick up where you left off.
sidebar:
  order: 0
---

Nouto is a local-first alternative to Postman. If you are moving away from Postman's account requirements, cloud sync, or telemetry, your existing work transfers in a few clicks.

## What Transfers

| Data | Imported |
|------|----------|
| Collections and folder structure | Yes |
| Requests (method, URL, params, headers, body) | Yes |
| Environments and variables | Yes |
| Auth settings (Bearer, Basic, API Key, OAuth 2.0) | Yes |
| Pre-request and test scripts | Yes |
| Collection-level and folder-level auth | Yes |
| Request descriptions and notes | Yes |
| WebSocket requests | Partial |
| Monitors and mock servers | No |

## Importing a Collection

1. In Postman, open the collection, click the **...** menu, and select **Export**.
2. Choose **Collection v2.1** and save the file.
3. In Nouto, open the Command Palette and run **Import Postman Collection**.
4. Select the exported JSON file.

The collection appears in your sidebar with all folders and requests intact.

## Importing an Environment

1. In Postman, go to **Environments**, click the **...** next to an environment, and select **Export**.
2. In Nouto, open the Command Palette and run **Import Postman Environment**.
3. Select the exported JSON file.

The environment appears in the Variables tab and is ready to activate.

## Exporting Back to Postman

If you need to share collections with teammates still on Postman, right-click any collection in Nouto and select **Export > Postman**. The output is Postman Collection v2.1 format and can be imported directly into Postman.
