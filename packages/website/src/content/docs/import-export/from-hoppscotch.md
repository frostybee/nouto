---
title: From Hoppscotch
description: Import Hoppscotch collection exports into Nouto and see which request settings carry over.
sidebar:
  order: 3
---

Nouto imports Hoppscotch collections exported as JSON. A file can hold one collection or several, and each becomes a Nouto collection with its folders and requests.

## What transfers

| Hoppscotch data | Result in Nouto |
|-----------------|-----------------|
| Collections, folders, and nested folders | Imported |
| Request method, URL, query parameters, and headers | Imported. Rows with an empty key are dropped. |
| JSON, URL-encoded, multipart, and GraphQL bodies | Imported. Other bodies become text bodies. |
| Basic, Bearer, and API Key auth | Imported |
| Other auth types, including OAuth 2.0 | Not imported. The request gets no auth. |
| Pre-request scripts, tests, and environments | Not imported |

## Import a Hoppscotch collection

1. In Hoppscotch, export your collection as JSON.
2. Import the file into Nouto:
   - In VS Code, run **Nouto: Import Hoppscotch Collection** from the Command Palette.
   - On either platform, click **Import / Export** in the Collections toolbar and select **Import Collection**. See [Import a collection file](/import-export/from-other#import-a-collection-file).
3. Select the exported JSON file.
