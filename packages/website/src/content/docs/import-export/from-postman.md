---
title: From Postman
description: Import Postman collections and environments into Nouto, see what carries over, and export collections back to Postman.
sidebar:
  order: 0
---

Nouto imports Postman Collection v2.0 and v2.1 files and Postman environment files. Nouto stores everything locally and doesn't need an account.

## What transfers

| Postman data | Result in Nouto |
|--------------|-----------------|
| Folders, including nested folders | Imported |
| Request method, URL, query parameters, and headers | Imported |
| Path variable values, such as the value of `:id` | Not imported. The `:id` placeholder stays in the URL. See [Requests imported from Postman](/building-requests/params#requests-imported-from-postman). |
| Raw (JSON or text), URL-encoded, form data, and GraphQL bodies | Imported. Disabled form rows are dropped. |
| Binary file bodies | Body type only. Select the file again in Nouto. |
| Request descriptions | Imported to the **Notes** tab |
| Basic, Bearer Token, API Key, and OAuth 2.0 auth | Imported |
| Digest, Hawk, AWS Signature, and NTLM auth | Not imported. The request gets no auth. |
| Collection-level auth and headers | Imported |
| Folder-level auth | Imported in the desktop app only |
| Collection variables | VS Code offers to save them as a new environment. The desktop app doesn't import them. |
| Pre-request and test scripts | Not imported |
| Environments and globals | Imported separately. See [Import an environment](#import-an-environment). |

## Import a collection

1. In Postman, open the `...` menu of the collection and select **Export**.
2. Choose **Collection v2.1** and save the file.
3. Import the file into Nouto:
   - In VS Code, run **Nouto: Import Postman Collection** from the Command Palette.
   - In the desktop app, click **Import / Export** in the Collections toolbar and select **Import Collection**.
4. Select the exported JSON file.

The collection appears in the sidebar. In VS Code, if the collection has variables, Nouto asks whether to save them as an environment. Select **Yes** to create an environment named after the collection.

## Import an environment

1. In Postman, open **Environments**, open the `...` menu of an environment, and select **Export**.
2. Import the file into Nouto:
   - In VS Code, run **Nouto: Import Postman Environment**. You can select several environment or globals files at once.
   - On either platform, open the Environments panel and click **Import environments**.

Each file becomes a new Nouto environment, named after the Postman environment. A globals file also becomes an environment, not a set of global variables. When you import through the Environments panel and an environment with the same name exists, Nouto adds ` (imported)` to the new name. See [Environments](/variables/environments) to activate it.

## Export back to Postman

To share a collection with someone who uses Postman, right-click the collection in the sidebar and select **Export** > **Postman Collection**. Nouto writes a Postman Collection v2.1 file. Scripts and assertions aren't included. See [Exporting](/import-export/exporting#postman-format) for the full list.
