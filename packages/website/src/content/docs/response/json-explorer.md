---
title: JSON Explorer
description: Interactive JSON viewer with tree and table views, search, query language, type generation, and more.
sidebar:
  order: 1
---

The JSON Explorer is a powerful, interactive viewer for JSON responses and files. Open it from any JSON response or directly from `.json` files in your workspace.

<!-- screenshot: response/json-explorer-overview.png -->
![JSON Explorer panel showing the tree view with a JSON response loaded, the toolbar buttons, and the breadcrumb path bar](/screenshots/response/json-explorer-overview.png)

## Opening the Explorer

- **From a response**: Click **Open in JSON Explorer** in the response toolbar when viewing a JSON response. The explorer opens with full request context, enabling you to create assertions and save variables back to the originating request.
- **From a file**: Right-click any `.json` file in the VS Code explorer and select **Open in JSON Explorer** (VS Code only). Files up to 20 MB are supported.
- **By pasting**: When the explorer is open and no input field is focused, paste JSON from your clipboard with `Ctrl+V`. The explorer parses and loads it automatically.

## Tree View

The default view displays JSON as a collapsible, color-coded hierarchy.

- Color-coded types: strings (orange), numbers (green), booleans (blue), null (gray italic), object keys (yellow badge), array keys (purple badge)
- Inline previews for collapsed nodes: `{ 3 keys }`, `[ 42 items ]`
- Click a node to expand or collapse it
- Double-click to expand or collapse recursively
- **Expand All**, **Collapse All**, and expand-to-depth buttons (levels 1–5) in the toolbar
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

## Query Language

Press `Ctrl+Shift+K` to open the query bar. Write structured queries to filter array items:

```
status contains "Ended"
age > 30 AND name ~ "john"
role = "admin" OR role = "editor"
```

Operators: `=`, `!=`, `>`, `<`, `>=`, `<=`, `~` (regex), `contains`, `startsWith`, `endsWith`.
Combinators: `AND`, `OR`, `NOT`, with `()` grouping.

Matched rows are highlighted in both tree and table views.

## Type Generation

Generate typed code from any JSON structure. Right-click a node and select **Generate Types**, or use the toolbar button. Supported output formats:

- TypeScript interfaces
- Zod schemas
- Rust structs (with serde derive macros)
- Go structs (with json tags)
- Python dataclasses
- JSON Schema

## Diff View

Compare two JSON documents side by side with structural diff highlighting. Use the diff button in the toolbar to paste a second document and see additions (green), deletions (red), and modifications (yellow) highlighted inline.

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

Copy the current view (or a selected node) in multiple formats:

- Formatted JSON
- Minified JSON
- YAML
- CSV
- Markdown table
- TypeScript literal
- Python dict
- PHP array

Save to file as JSON, YAML, or CSV using the **Save** option.

## More Features

- **Breadcrumb navigation**: Clickable path bar showing your current location in the document
- **Bookmarks panel**: Pin and jump to frequently accessed paths
- **Statistics panel**: Node count, max depth, type distribution breakdown
- **Minimap**: Visual document overview with click-to-scroll and drag support
- **Word wrap**: Toggle with `Alt+Z` (on by default)

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+F` | Toggle search |
| `Ctrl+/` | Toggle JSONPath filter |
| `Ctrl+Shift+K` | Toggle query bar |
| `Ctrl+Shift+T` | Toggle tree / table view |
| `Alt+Z` | Toggle word wrap |
| Arrow keys | Navigate tree nodes |
| `Enter` | Expand / collapse selected node |
