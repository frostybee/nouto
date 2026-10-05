---
title: From Thunder Client
description: Import Thunder Client collections into Nouto from an export file or a thunder-tests folder, and find where Thunder Client features live in Nouto.
sidebar:
  order: 1
---

Nouto imports Thunder Client collections, with their folders and requests, from an exported JSON file or from a `thunder-tests` folder. Nouto runs in VS Code and as a desktop app, and doesn't need an account.

## What transfers

| Thunder Client data | Result in Nouto |
|---------------------|-----------------|
| Collections, folders, and nested folders | Imported |
| Request method, URL, query parameters, and headers | Imported |
| JSON, text, XML, form-encoded, form data, and GraphQL bodies | Imported. XML bodies become text bodies. |
| Basic, Bearer, API Key, OAuth 2.0, and AWS auth | Imported |
| Other auth types | Not imported. The request gets no auth. |
| Environments | Not imported |
| Tests | Not imported |

Recreate environments in Nouto by hand. See [Environments](/variables/environments).

## Import from a folder

Thunder Client can save its data to a `thunder-tests` folder in your workspace. Nouto reads `thunderCollection.json` and `thunderRequestCollection.json` from that folder.

1. Click **Import / Export** in the Collections toolbar of the sidebar.
2. Select **Import Thunder Client Folder**.
3. In VS Code, choose **From Folder**.
4. Select the `thunder-tests` folder.

## Import from an export file

In VS Code:

1. Run **Nouto: Import Thunder Client** from the Command Palette.
2. Choose **From File**.
3. Select the JSON file you exported from Thunder Client.

In the desktop app, click **Import / Export** in the Collections toolbar, select **Import Collection**, and select the exported JSON file. Nouto detects the Thunder Client format.

## Thunder Client features in Nouto

| In Thunder Client | In Nouto |
|-------------------|----------|
| Tests tab | **Tests** tab with assertions. See [Assertions](/testing/assertions). |
| Environments | Environments and global variables. See [Environments](/variables/environments). |
| Collection runner | Collection runner with CSV and JSON data files. See [Collection runner](/testing/collection-runner). |
| Command-line runs | The `nouto run` command. See [Run collections from the CLI](/cli/run). |

For a feature comparison across API clients, see [Feature comparison](/compare).
