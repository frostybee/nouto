---
title: From Bruno
description: Import a Bruno collection folder of .bru files into Nouto in VS Code, or a single .bru file in the desktop app.
sidebar:
  order: 4
---

Bruno stores each request as a `.bru` file in a folder tree. Nouto reads those files and recreates the requests, with each subfolder as a Nouto folder.

## What transfers

| Bruno data | Result in Nouto |
|------------|-----------------|
| Subfolders | Folders |
| Request name, method, URL, query parameters, and headers | Imported |
| JSON, text, XML, form URL-encoded, multipart form, and GraphQL bodies, including GraphQL variables | Imported |
| Basic, Bearer, and API Key auth | Imported |
| Other auth types | Not imported. The request gets no auth. |
| Scripts, tests, variables, and docs | Not imported |

Nouto reads every `.bru` file in the folder tree as a request, skipping folders whose names start with a dot. Bruno also stores collection settings, folder settings, and environments as `.bru` files, such as `collection.bru`, `folder.bru`, and the files in `environments/`. Each of these becomes a `GET` request with no URL. Delete those requests after the import, and recreate your environments by hand. See [Environments](/variables/environments).

## Import a Bruno collection in VS Code

1. Run **Nouto: Import Bruno Collection** from the Command Palette.
2. Select the Bruno collection folder.

Nouto creates a collection named after the folder.

## Import a .bru file in the desktop app

The desktop app imports one `.bru` file at a time. It can't import a whole Bruno folder.

1. Click **Import / Export** in the Collections toolbar and select **Import Collection**.
2. Select a `.bru` file.

Nouto creates a collection named **Bruno Import** that holds the request.
