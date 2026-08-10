---
title: JSON Explorer Extension
description: Install and use the standalone Nouto JSON Explorer VS Code extension, a JSON viewer that works without the full REST client.
sidebar:
  order: 0
---

Nouto JSON Explorer is a standalone VS Code extension that opens JSON files in an interactive tree and table viewer. It runs on the same explorer engine as the Nouto REST client and the desktop app, so the viewing experience is identical, but it installs on its own and has no request, collection, or environment features.

Install it when you want a fast JSON viewer in VS Code and do not need the REST client.

## Installation

Search for **Nouto JSON Explorer** in the VS Code Extensions view and install it, or run this from the Command Palette:

```
ext install frostybee-dev.nouto-json-explorer
```

Requires Visual Studio Code 1.74.0 or later.

## Opening JSON

- **From the file explorer**: Right-click any `.json` file and select **Open with JSON Explorer**.
- **From the editor**: Right-click inside an open JSON file and select **Open with JSON Explorer**, or click the JSON Explorer icon in the editor title bar.
- **From anywhere on disk**: Click the folder icon in the sidebar, or run **Nouto JSON Explorer: Open JSON File from Disk** from the Command Palette. This works for files outside the current workspace.
- **From the clipboard**: Copy JSON from a browser, terminal, or API response, open the sidebar, and click **Paste JSON**.
- **From a URL**: Click **Fetch from URL...** in the sidebar, enter an HTTP endpoint, and click Fetch. Optionally add custom request headers (e.g. API keys) in the form - header values are stored securely via the operating system keychain. Fetched URLs appear in the recent files list and re-fetch fresh data when clicked. Requests are GET-only.

## Sidebar

The sidebar keeps a list of recently opened files and fetched URLs. Click an entry to reopen the file or re-fetch the URL. Hover to reveal a remove button. File entries show a JSON icon; URL entries show a globe icon.

| Icon | Action |
|------|--------|
| Folder | Open a JSON file from disk |
| Clear all | Clear the recent files list |
| Info | Open the About panel |

## Feature reference

Every viewing feature is shared with the REST client and documented on one page: [JSON Explorer](/response/json-explorer). That page covers tree and table views, search, the JSONPath filter, the context menu, statistics, the minimap, pinned nodes, timestamp hints, multi-select, and copy formats - all of which behave the same in this extension. The JSONPath filter and the query filter each include a built-in reference panel (click the **?** button in the filter bar).

Three features have dedicated pages in this section:

- [Query Filter](/json-explorer/query-filter) - the field comparison language on `Ctrl+Shift+K`
- [Compare](/json-explorer/compare) - diff the open document against another JSON document
- [Generate Types](/json-explorer/generate-types) - TypeScript, Zod, Rust, Go, Python, and JSON Schema output

## Limitations

- Files larger than 20 MB are not supported and open in the default text editor instead.
- The extension does not modify files. Make edits in a text editor.
