---
title: JSON Explorer
description: Interactive JSON viewer with tree and table views, search, JSONPath filtering, bookmarks, and copy support.
sidebar:
  order: 1
---

The JSON Explorer is an interactive viewer for JSON responses and files. Open it from a JSON response, from a `.json` file in VS Code, from the standalone JSON Explorer extension, or by pasting JSON into the explorer.

<!-- screenshot: response/json-explorer-overview.png -->
![JSON Explorer panel showing the tree view with a JSON response loaded, the toolbar buttons, and the breadcrumb path bar](/screenshots/response/json-explorer-overview.png)

## Opening the Explorer

- **From a response**: Click **Open in JSON Explorer** in the response toolbar when viewing a JSON response. The explorer opens with request context, enabling you to create assertions and save variables back to the originating request.
- **From a file in the API client extension**: Right click any `.json` file in the VS Code explorer and select **Open in JSON Explorer**. Files up to 20 MB are supported.
- **From the JSON Explorer extension**: Use **Open with JSON Explorer**, **Open JSON File from Disk**, or the JSON Explorer sidebar.
- **By pasting**: When the explorer is open and no input field is focused, paste JSON from your clipboard with `Ctrl+V`. The explorer parses and loads it automatically.

## Tree View

The default view displays JSON as a collapsible, color-coded hierarchy.

- Color-coded types: strings (orange), numbers (green), booleans (blue), null (gray italic), object keys (yellow badge), array keys (purple badge)
- Inline previews for collapsed nodes: `{ 3 keys }`, `[ 42 items ]`
- Click a node to expand or collapse it
- Double-click to expand or collapse recursively
- **Expand All**, **Collapse All**, and expand to depth buttons for levels 1 through 5 in the toolbar
- Virtual scrolling for large documents
- Copy value on hover
- Keyboard navigation: arrow keys, Home/End

## Table View

When the root is an array of objects, switch to table view with the toolbar toggle or `Ctrl+Shift+T`.

- Auto-detected columns from all array items
- Click column headers to sort ascending or descending
- Drag column borders to resize; double-click to auto-fit
- Pinned row numbers and first data column
- Pagination with "Show more"
- Copy as CSV

## Search

Press `Ctrl+F` to search across keys and values.

- Case-sensitive, regex, and fuzzy (fzf) modes
- Scope to keys only, values only, or a subtree
- Filter mode: toggle between highlighting matches and hiding non-matches
- Navigate with `Enter` / `Shift+Enter`
- Inline text highlighting in both tree and table views

## JSONPath Filter

Press `Ctrl+/` to open the JSONPath filter. Enter an expression like `$.data[*].name` to filter the view to matching nodes.

## Context Menu

Right-click any node:

| Action | Description |
|--------|-------------|
| Copy Value | Copy the value at this node |
| Copy Path | Copy the JSONPath expression to reach this node |
| Copy Key | Copy the key name |
| Bookmark | Pin this path to the bookmarks panel |
| Search in this node | Scope search to this subtree |
| Expand Recursively | Expand this node and all children |
| Create Assertion | Auto-generate a JSON Path assertion targeting this value (from response context) |
| Save as Variable | Save this value to your active environment (from response context) |

## Copy As / Export

Copy the current document or selected node in these formats:

- Formatted JSON
- Minified JSON
- YAML

## More Features

- **Breadcrumb navigation**: Clickable path bar showing your current location in the document
- **Bookmarks panel**: Pin and jump to frequently accessed paths
- **Node count**: Toolbar badge showing the number of nodes in the loaded document
- **Word wrap**: Toggle with `Alt+Z`

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+F` | Toggle search |
| `Ctrl+/` | Toggle JSONPath filter |
| `Ctrl+Shift+T` | Toggle tree / table view |
| `Alt+Z` | Toggle word wrap |
| Arrow keys | Navigate tree nodes |
| `Enter` | Expand / collapse selected node |
