---
title: Notes
description: Write Markdown notes on requests, collections, and folders in Nouto.
sidebar:
  order: 7
---

Notes keep endpoint documentation next to the request, collection, or folder it describes. Notes use Markdown.

## Request notes

1. Open the request and select the **Notes** tab.
2. Write the note in Markdown.
3. Select **Edit**, **Split**, or **Preview** to switch between the editor, a side-by-side view, and the rendered note.
4. Save the request to its collection to keep the note.

When a request has a note, an asterisk appears after the **Notes** tab label. Select **Clear** to delete the whole note; Nouto asks you to confirm first.

Use request notes for what the endpoint does, the inputs it needs, and any caveats for people who use the collection.

## Collection and folder notes

Right-click a collection or folder in the sidebar, select **Settings...**, and open the **Notes** tab. These notes describe the collection or folder itself and are separate from the notes on the requests inside it.

## Sharing notes

Notes are saved with the collection data. When the collection is stored in your project, they're in the files you commit. That's Workspace storage in the VS Code extension, or a project directory in the desktop app; see [Storage modes](/settings/storage-modes). Notes are also included when you export a collection in Nouto's native format.

Notes are stored as plain text. Don't put credentials or other secrets in them.
