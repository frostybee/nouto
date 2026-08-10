---
title: JSON Explorer
description: Interactive JSON viewer with tree and table views, search, query and JSONPath filtering, compare, type generation, statistics, bookmarks, pinned nodes, and copy support.
sidebar:
  order: 1
---

The JSON Explorer is an interactive viewer for JSON responses and files. Open it from a JSON response, from a `.json` file in VS Code, from the standalone JSON Explorer extension, or by pasting JSON into the explorer.

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
- Timestamp hints: numbers and strings recognized as Unix seconds, Unix milliseconds, or ISO 8601 show an inline formatted date next to the value, with the full date on hover
- Multi-select: `Ctrl`/`Cmd`+click to toggle nodes, `Shift`+click to select a range, `Ctrl+A` to select all visible nodes, `Escape` to clear. The status bar shows the selection count

## Table View

When the root is an array of objects, switch to table view with the toolbar toggle or `Ctrl+Shift+T`.

- Auto-detected columns from all array items
- Click column headers to sort ascending or descending
- Drag column borders to resize; double-click to auto-fit
- Row numbers stay pinned, and you can pin any column in place from its header
- Timestamp hints in cells for recognized Unix and ISO 8601 date values
- Rows matching the query filter are highlighted
- Pagination with "Show more"
- CSV export button in the table toolbar

## Search

Press `Ctrl+F` to search across keys and values.

- Case-sensitive, regex, and fuzzy (fzf) modes
- Scope to keys only, values only, or a subtree
- Filter mode: toggle between highlighting matches and hiding non-matches
- Navigate with `Enter` / `Shift+Enter`
- Inline text highlighting in both tree and table views

## JSONPath Filter

Press `Ctrl+/` to open the JSONPath filter. Enter an expression like `$.data[*].name` to filter the view to matching nodes.

## Query Filter

Press `Ctrl+Shift+K` to open the query filter. Unlike the JSONPath filter above, it uses field comparisons rather than path expressions: `status = "active"`, `age > 30`, `name contains "john"`. Conditions combine with `AND`, `OR`, `NOT`, and parentheses, and field paths use dot notation such as `address.city`. Matches are highlighted in both tree and table views, with controls to step through them.

See [Query Filter](/json-explorer/query-filter) for the full operator reference and examples.

## Context Menu

Right-click any node:

| Action | Description |
|--------|-------------|
| Copy Value | Copy the value at this node |
| Copy Path | Copy the JSONPath expression to reach this node |
| Copy Key | Copy the key name |
| Bookmark | Add this path to the bookmarks panel |
| Pin | Add this path to the always-visible Pinned strip above the tree |
| Search in this node | Scope search to this subtree |
| Expand Recursively | Expand this node and all children |
| View as Table | Show this array of objects in table view |
| Create Assertion | Auto-generate a JSON Path assertion targeting this value (from response context) |
| Save as Variable | Save this value to your active environment (from response context) |
| Copy N values | Copy every selected value (appears when more than one node is selected) |
| Bookmark N nodes | Bookmark every selected node (appears when more than one node is selected) |

## Compare

Click **Compare** (the diff icon) in the toolbar to diff the open document against another JSON document. Paste the second document into the compare panel, and the explorer reports how many paths were added, removed, changed, and left unchanged, then marks each one in a merged tree.

See [Compare](/json-explorer/compare) for details. This is separate from [Response Diff](/response/response-diff), which compares a response against the previous response for the same request.

## Generate Types

Click **Generate Types** in the toolbar to turn the loaded JSON into type definitions in TypeScript, Zod, Rust, Go, Python, or JSON Schema. With a node selected, only that subtree is used. See [Generate Types](/json-explorer/generate-types).

## Statistics

Click the statistics button in the toolbar for a breakdown of the loaded document: total keys, objects, arrays, values, and maximum nesting depth; a type distribution bar covering strings, numbers, booleans, nulls, objects, and arrays with counts and percentages; array length and string length summaries; and a list of unique keys.

## Copy As / Export

Copy the current document or selected node in these formats:

- Formatted JSON
- Minified JSON
- YAML
- TypeScript
- Python
- PHP array
- CSV (arrays only)
- Markdown table (arrays only)

When several nodes are multi-selected, the copy applies to the whole selection.

### Save to File

The same menu can save the document straight to disk as JSON, YAML, or CSV. In the VS Code extensions this opens the native save dialog.

## More Features

- **Breadcrumb navigation**: Clickable path bar showing your current location in the document
- **Bookmarks panel**: A panel you open from the toolbar to save and jump to frequently accessed paths
- **Pinned nodes**: Pin a node from its hover button or the context menu and it joins an always-visible **Pinned** strip above the tree, showing a live preview of each pinned value. Click a pin to jump to it, remove pins individually, or clear them all. Pins persist between sessions. Pinning differs from bookmarking: the Pinned strip stays on screen with value previews, while Bookmarks is a panel you open on demand
- **Minimap**: Toolbar toggle showing a canvas overview of the document with a viewport indicator you can click to scroll. It appears for documents with more than 20 visible nodes, and is separate from the [response viewer's minimap](/response/response-viewer#minimap), which maps the raw response text
- **Node count**: Toolbar badge showing the number of nodes in the loaded document
- **Word wrap**: Toggle with `Alt+Z`

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+F` | Toggle search |
| `Ctrl+/` | Toggle JSONPath filter |
| `Ctrl+Shift+K` | Toggle query filter |
| `Ctrl+Shift+T` | Toggle tree / table view |
| `Alt+Z` | Toggle word wrap |
| Arrow keys | Navigate tree nodes |
| `Enter` | Expand / collapse selected node |
| `Ctrl`/`Cmd`+click | Add or remove a node from the selection |
| `Shift`+click | Select a range of nodes |
| `Ctrl+A` | Select all visible nodes |
| `Escape` | Clear the selection |
