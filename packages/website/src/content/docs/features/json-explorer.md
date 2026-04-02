---
title: JSON Explorer
description: Interactive JSON viewer with tree and table views, search, query language, type generation, and more.
---

The JSON Explorer is a powerful, interactive viewer for JSON responses and files. Open it from any JSON response or directly from `.json` files in your workspace.

## Opening the Explorer

- **From a response**: Click "Open in JSON Explorer" in the response toolbar
- **From a file**: Right-click a `.json` file in the explorer, or use the command palette: `Nouto: Open in JSON Explorer`

## Tree View

The default view displays JSON as a collapsible, color-coded tree.

- Color-coded types (strings, numbers, booleans, null, keys)
- Inline previews for collapsed nodes (`{ 3 keys }`, `[ 42 items ]`)
- Expand/collapse all, expand to depth level 1-5
- Double-click to expand a node recursively
- Virtual scrolling for large documents
- Copy value on hover
- Keyboard navigation (arrow keys, Home/End)

## Table View

When the root JSON is an array of objects, switch to table view with the toggle button or `Ctrl+Shift+T`.

- Auto-detected columns from all array items
- Click headers to sort ascending/descending
- Drag column borders to resize, double-click to auto-fit
- Pinned row numbers and first data column
- Pagination with "Show more"
- Copy as CSV

## Search

Press `Ctrl+F` to search across keys and values.

- Case sensitive, regex, and fuzzy (fzf) modes
- Scope to keys only, values only, or a specific subtree
- Filter mode: toggle between highlighting matches and hiding non-matches
- Next/previous navigation with `Enter` / `Shift+Enter`
- Inline text highlighting in both tree and table views

## JSONPath Filter

Press `Ctrl+/` to filter by JSONPath expressions like `$.data[*].name`.

## Query Language

Press `Ctrl+Shift+K` to open the query bar. Write structured queries to filter array items:

```
status contains "Ended"
age > 30 AND name ~ "john"
```

Operators: `=`, `!=`, `>`, `<`, `>=`, `<=`, `~` (regex), `contains`, `startsWith`, `endsWith`.
Combinators: `AND`, `OR`, `NOT`, with `()` grouping.

Navigate matches with next/previous buttons. Matched rows are highlighted in both tree and table views.

## Type Generation

Generate typed code from any JSON structure:

- TypeScript interfaces
- Zod schemas
- Rust structs (with serde)
- Go structs (with json tags)
- Python dataclasses
- JSON Schema

## Diff View

Compare two JSON documents side by side with structural diff highlighting (additions, deletions, modifications).

## Context Menu Actions

Right-click any node for:

- **Copy Value / Copy Path / Copy Key**
- **Bookmark** a path for quick access
- **Search in this node** to scope search to a subtree
- **Expand Recursively** or expand to specific depth
- **Create Assertion** (from response): auto-generates a JSON Path test assertion
- **Save as Variable** (from response): saves the value to your active environment

## Copy As / Export

Copy JSON in multiple formats: formatted JSON, minified JSON, YAML, CSV, Markdown table, TypeScript literal, Python dict, PHP array. Save to file as JSON, YAML, or CSV.

## More Features

- **Breadcrumb navigation**: Clickable path bar showing current location
- **Bookmarks panel**: Pin and jump to frequently accessed paths
- **Statistics panel**: Node counts, depth, type distribution
- **Minimap**: Visual overview with click-to-scroll and drag support
- **Word wrap**: Toggle with `Alt+Z` (on by default)
- **Paste JSON**: Press `Ctrl+V` anywhere to load JSON from clipboard

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+F` | Toggle search |
| `Ctrl+/` | Toggle JSONPath filter |
| `Ctrl+Shift+K` | Toggle query |
| `Ctrl+Shift+T` | Toggle tree/table view |
| `Alt+Z` | Toggle word wrap |
