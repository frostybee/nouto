---
title: JSON Explorer extension
description: Install the standalone Nouto JSON Explorer extension for VS Code and open JSON, JSONL, and NDJSON files, pasted JSON, and JSON from a URL.
sidebar:
  order: 0
---

Nouto JSON Explorer is a standalone VS Code extension that opens JSON in an interactive tree and table viewer. It uses the same explorer as the Nouto REST client and the desktop app, but installs on its own and has no requests, collections, or environments. Install it when you want the JSON viewer without the REST client.

This page covers installing the extension and getting JSON into it. The viewer itself is documented on the [JSON Explorer](/response/json-explorer) page.

## Install the extension

Search for **Nouto JSON Explorer** in the VS Code Extensions view and click **Install**. You can also press `Ctrl+P` (`Cmd+P` on macOS) and run:

```text
ext install frostybee-dev.nouto-json-explorer
```

The extension requires VS Code 1.74.0 or later.

## Open a JSON file

Open files with the extension in any of these ways:

- Right-click a `.json`, `.jsonl`, or `.ndjson` file in the Explorer view and select **Open with JSON Explorer**.
- With one of these files open in the editor, click the JSON Explorer icon in the editor title bar, or right-click in the editor and select **Open with JSON Explorer**.
- Run **Reopen Editor With...** from the Command Palette and select **JSON Explorer**.
- To open a file outside the workspace, click **Open JSON File...** in the JSON Explorer sidebar, or run **Nouto JSON Explorer: Open JSON File from Disk...** from the Command Palette.

A file that isn't a single JSON document but has one JSON value on each non-blank line loads as JSONL: an array with one element per line. If a line in a `.jsonl` or `.ndjson` file doesn't parse, an error message names the line number.

The explorer reloads the file when it changes on disk or when you save it in a text editor. Expanded nodes, the view mode, bookmarks, and pins stay as they were. The selection, filter results, and any comparison are cleared.

## Paste JSON from the clipboard

Copy JSON from any source, open the JSON Explorer sidebar, and click **Paste JSON**. The JSON opens in a new **Pasted JSON** tab. The clipboard must hold a single valid JSON document.

## Fetch JSON from a URL

1. Click **Fetch from URL...** in the JSON Explorer sidebar, or run **Nouto JSON Explorer: Fetch JSON from URL...** from the Command Palette.
2. Enter an `http://` or `https://` URL.
3. Optional: expand **Headers** and click **+ Add header** to send headers such as an API key.
4. Click **Fetch**.

The extension sends a `GET` request, follows redirects, and opens the response in a new tab named after the host and path. The fetch fails if the response doesn't arrive within 30 seconds, is larger than 20 MB, has an error status, or isn't valid JSON.

After a successful fetch, the URL appears in **Recent Files**. Click it to fetch fresh data. Headers you entered are saved in VS Code's secret storage for that URL and sent again on each re-fetch. Removing the URL from **Recent Files** deletes its saved headers.

## Use the sidebar

The JSON Explorer sidebar keeps the 15 most recently opened files and fetched URLs under **Recent Files**. Click an entry to reopen the file or fetch the URL again. Hover over an entry to show its remove button. Right-click an entry for more actions:

| Action | Applies to | Effect |
|--------|------------|--------|
| **Copy Path** or **Copy URL** | Files and URLs | Copies the file path or URL |
| **Edit URL** | URLs | Opens the fetch form with the URL filled in |
| **Open in Browser** | URLs | Opens the URL in your browser |
| **Remove** | Files and URLs | Removes the entry from the list |

The sidebar title bar has three buttons:

| Button | Action |
|--------|--------|
| Folder icon | Open a JSON file from disk |
| Clear icon | Clear the recent files list, after you confirm |
| Info icon | Show the About panel |

## Settings

The extension adds two settings under **Nouto JSON Explorer** in the VS Code settings:

| Setting | Default | Description |
|---------|---------|-------------|
| `noutoJsonExplorer.arrayPageSize` | `2000` | How many array items the tree and table views show before a **Show more** button. Accepts 100 to 50000. |
| `noutoJsonExplorer.showScrollToTop` | `true` | Show the scroll-to-top button in the tree view after you scroll down. |

## Features shared with Nouto

Every viewing feature, including the tree and table views, search, filters, the context menu, statistics, schema validation, and copy formats, behaves the same as in Nouto. See [JSON Explorer](/response/json-explorer) for the full reference.

These pages cover the larger features in detail:

- [Query filter](/json-explorer/query-filter) finds array items with field comparisons such as `age > 30`.
- [Compare JSON documents](/json-explorer/compare) diffs the open document against a second document.
- [Generate types](/json-explorer/generate-types) produces TypeScript, Zod, Rust, Go, Python, and JSON Schema definitions.

**Create Assertion** and **Save as Variable** need a Nouto request and environment, so the extension doesn't show them.

## Limitations

- Files larger than 20 MB open in the default text editor instead.
- The extension is read-only. Edit files in a text editor; the explorer reloads them when you save.
