---
title: From Insomnia
description: Import Insomnia v4 export files into Nouto and see which request settings carry over.
sidebar:
  order: 2
---

Nouto imports Insomnia data exported in the Insomnia v4 format, as JSON or YAML. Each Insomnia workspace becomes a Nouto collection, and each request group becomes a folder.

Nouto can't read the Insomnia v5 YAML format. If your Insomnia version offers more than one export format, choose the v4 format.

## What transfers

| Insomnia data | Result in Nouto |
|---------------|-----------------|
| Workspaces | One collection per workspace |
| Request groups, including nested groups | Folders |
| Request method, URL, query parameters, and headers | Imported |
| JSON, URL-encoded, multipart, and GraphQL bodies | Imported. Other bodies become text bodies. |
| Basic, Bearer, API Key, and OAuth 2.0 auth | Imported |
| Other auth types | Not imported. The request gets no auth. |
| Environments, cookie jars, and request group settings | Not imported |

## Import an Insomnia export

1. In Insomnia, export your data in the Insomnia v4 format, as JSON or YAML.
2. Import the file into Nouto:
   - In VS Code, run **Nouto: Import Insomnia Collection** from the Command Palette.
   - On either platform, click **Import / Export** in the Collections toolbar and select **Import Collection**. See [Import a collection file](/import-export/from-other#import-a-collection-file).
3. Select the exported file.

Recreate your Insomnia environments in Nouto. See [Environments](/variables/environments).
