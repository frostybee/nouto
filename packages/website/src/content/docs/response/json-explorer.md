---
title: JSON Explorer
description: Explore JSON responses and files in a tree or table view, with search, JSONPath and query filters, compare, type generation, schema validation, statistics, bookmarks, and pins.
sidebar:
  order: 1
---

The JSON Explorer is an interactive viewer for large or deeply nested JSON. It shows a document as a collapsible tree or as a table, and adds search, filters, bookmarks, pins, schema validation, and type generation.

The same explorer runs in three places:

- The Nouto VS Code extension opens it in an editor tab beside the request.
- The Nouto desktop app opens it in place of the request view. Click **Back to Requests** to return.
- The standalone [JSON Explorer extension](/json-explorer/) for VS Code opens JSON files without the REST client.

This page is the reference for features that all three share. Differences between them are noted where they apply.

## Open the explorer

To explore a JSON response, click **Open in JSON Explorer** in the body toolbar of the response panel. The button appears when the response body is JSON. Sending the request again refreshes the open explorer with the new response. In VS Code, opening the explorer again from the same request reuses its tab.

To explore a JSON file with the Nouto VS Code extension, right-click a `.json` file in the Explorer view or an editor tab and select **Open in JSON Explorer**. You can also run **Nouto: Open in JSON Explorer** from the Command Palette while a JSON file is active. Files up to 20 MB are supported. The JSON Explorer extension opens more file types; see [Open a JSON file](/json-explorer/#open-a-json-file).

To replace the open document with JSON from the clipboard, press `Ctrl+V` while no input field in the explorer has focus. The clipboard must hold a JSON object or array.

On macOS, press `Cmd` wherever this page says `Ctrl`.

## Tree view

The tree view is the default. It shows one row per key or array element:

- Values are colored by type using your theme's colors. `null` values are in italics.
- A collapsed object or array shows a count badge, for example `3 keys` or `42 items`.
- Click a row to select it and to expand or collapse it. Double-click a collapsed row to expand it and everything inside it.
- Hover over a row to show buttons that pin the node, bookmark it, or copy its value.
- Arrays show 2,000 items at a time. Click the `Show N more` row at the end of the list to load the next batch. In the JSON Explorer extension, the `noutoJsonExplorer.arrayPageSize` setting changes the batch size.

The toolbar controls the tree as a whole:

- **Expand All** expands every node. The arrow next to it opens a menu with **Expand to Level 1** through **Expand to Level 5**.
- **Collapse All** collapses every node.
- **Sort keys alphabetically** shows object keys in alphabetical order. Only the tree display changes. The document, the table view, the diff, and copied values keep the original order.
- **Toggle word wrap** (`Alt+Z`) wraps long values onto several lines. Word wrap is on by default.

### Timestamp hints

The tree shows a formatted date after values that look like timestamps, and the date's format when you hover over the value:

| Value | Detected as |
|-------|-------------|
| A number from 1,000,000,000 to 9,999,999,999 | Unix seconds |
| A number from 1,000,000,000,000 to 9,999,999,999,999 | Unix milliseconds |
| A string that starts with an ISO 8601 date and time, such as `2026-03-15T14:30:00Z` | ISO 8601 |

Dates are formatted for your locale. A date without a time, such as `2026-03-15`, gets no hint.

### Embedded JSON

A string value that itself contains a JSON object or array shows a **JSON** badge. The explorer checks strings up to 64 KB. To explore the embedded document, right-click the value and select **Open Embedded JSON in New Tab** (VS Code) or **Open Embedded JSON** (desktop).

### Multi-select

Select several nodes to copy or bookmark them together:

- `Ctrl+click` adds or removes a node.
- `Shift+click` selects the range between the last selected node and the clicked node.
- `Ctrl+A` selects every visible node.
- `Escape` clears the selection.

The status bar shows how many nodes are selected. The context menu then offers **Copy N values** and **Bookmark N nodes**, and the **Copy as...** menu copies the selected values as an array.

## Table view

When the document is an array whose first item is an object, the toolbar shows **Tree** and **Table** buttons. Click **Table** or press `Ctrl+Shift+T` to switch. To show a nested array as a table, right-click it in the tree and select **View as Table**.

- Columns come from the keys of every item.
- Click a column header to sort by that column. Click again to reverse the order.
- Drag a column border to resize the column. Double-click the border to fit the column to its content.
- Row numbers stay in place when you scroll sideways. Click the pin button in a column header to keep that column in place too.
- Cells show timestamp hints, like the tree.
- Rows that match the search or the query filter are highlighted. In filter mode, the table shows only matching rows.
- Long tables show a **Show more** button with the number of remaining rows.
- **Copy as CSV** copies the table to the clipboard as CSV.

## Search

Press `Ctrl+F` or click **Search** to search keys and values. Press `Enter` for the next match and `Shift+Enter` for the previous one. Matching text is highlighted in the tree and the table.

The search bar has these options:

| Option | Effect |
|--------|--------|
| **Toggle regex** | Treat the search text as a regular expression |
| **Toggle case sensitivity** | Match letter case exactly |
| Search scope | Cycle between **All**, **Keys**, and **Values** |
| **Toggle fuzzy search** | Typo-tolerant matching, using the fzf algorithm |
| **Toggle filter mode** | Switch between highlighting matches and hiding rows that don't match |

To search inside one object or array, right-click it and select **Search in this node**. A badge in the search bar shows the scope. Click the badge to search the whole document again.

## JSONPath filter

Press `Ctrl+/` or click **Filter** to open the JSONPath filter. Enter an expression such as `$.data[*].name`. The explorer replaces the document with the nodes the expression selects and shows the number of matches. If the expression is invalid, the bar shows the error.

Click **?** in the filter bar to open the **JSONPath Reference** panel, which covers the syntax, filter operators, and examples. Press `Escape` to close the bar and clear the filter.

## Query filter

Press `Ctrl+Shift+K` or click **Query** to find array items with field comparisons instead of paths, for example `status = "active" AND age > 30`. Matching items are highlighted in the tree and the table, and you can step through them. See [Query filter](/json-explorer/query-filter) for the operators, field paths, and examples.

## Context menu

Right-click a node to open its context menu. Some actions appear only for certain nodes:

| Action | Shown for | Effect |
|--------|-----------|--------|
| **Copy N values** | A selection of more than one node | Copies the selected values as a JSON array |
| **Bookmark N nodes** | A selection of more than one node | Bookmarks every selected node |
| **Copy Value** | Every node | Copies the value as JSON |
| **Copy Path** | Every node | Copies the node's JSONPath, for example `$.users[0].name` |
| **Copy Key** | Object keys and array elements | Copies the key or index |
| **Bookmark** or **Remove Bookmark** | Every node | Adds the node to the bookmarks panel or removes it |
| **Pin** or **Unpin** | Every node | Adds the node to the **Pinned** strip or removes it |
| **Search in this node** | Objects and arrays | Limits search to this node |
| **View as Table** | Arrays whose first item is an object | Shows this array in the table view |
| **Open Subtree in New Tab** or **Open Subtree** | Objects and arrays | Opens the node as its own document. VS Code opens a new tab. The desktop app replaces the current document and shows **Back to previous document**. |
| **Open Embedded JSON in New Tab** or **Open Embedded JSON** | Strings that contain JSON | Opens the parsed string as its own document |
| **Expand Recursively** or **Collapse** | Objects and arrays | Expands everything inside the node, or collapses it |
| **Expand to Level 1** to **Expand to Level 3** | Every node | Expands the whole tree to that depth |
| **Create Assertion** | Documents opened from a saved request's response | See [Response actions](#response-actions) |
| **Save as Variable** | Values in documents opened from a saved request's response | See [Response actions](#response-actions) |

## Response actions

When you open the explorer from the response of a request saved in a collection, the explorer links back to that request. The request's method and URL appear above the tree. Click them to go back to the request.

Two context menu actions use this link:

- **Create Assertion** adds an assertion on the node's path to the request's **Tests** tab. For a value, the assertion checks that the path equals the current value. For an object or array, it checks that the path exists. See [Assertions](/testing/assertions).
- **Save as Variable** opens the **Save as Environment Variable** dialog. Enter a variable name and click **Save** to store the value in the active environment. If no environment is active, Nouto asks you to select one first. See [Environments](/variables/environments).

## Compare

Click **Compare with another JSON** in the toolbar to diff the open document against a second JSON document that you paste or pick from disk. The explorer counts the added, removed, changed, and unchanged paths and marks each one in a side-by-side list. See [Compare JSON documents](/json-explorer/compare).

This compares two arbitrary documents. To compare a response with the previous response from the same request, use [Response diff](/response/response-diff).

## Generate types

Click **Generate types** in the toolbar to generate TypeScript, Zod, Rust, Go, Python, or JSON Schema definitions from the document or from the selected node. See [Generate types](/json-explorer/generate-types).

## Schema validation

To check the document against a JSON Schema:

1. Click **Validate against JSON Schema** (the verified icon) in the toolbar.
2. Paste the schema into the **Schema Validation** panel.
3. Click **Validate**.

If the document is valid, the panel shows a **Valid** badge. Otherwise, the tree marks every node that fails, and the panel lists each violation with its path and message. Click a violation to jump to its node. Click **Clear schema** to remove the schema and the marks.

## Statistics

Click **JSON statistics** in the toolbar to open the **Statistics** panel. It shows:

- The number of keys, objects, arrays, and primitive values, and the maximum nesting depth.
- A type distribution bar for strings, numbers, booleans, nulls, objects, and arrays. Hover over a segment for its count and percentage.
- The minimum, maximum, and average length of arrays and of strings.
- The list of unique keys in the document.

## Copy and save

**Copy JSON to clipboard** in the toolbar copies the whole document as formatted JSON.

**Copy as...** in the toolbar copies the selected values, the selected node, or the whole document, in that order of preference. It offers these formats:

- JSON (formatted)
- JSON (minified)
- YAML
- TypeScript
- Python
- PHP array
- CSV, for arrays only
- Markdown table, for arrays only

The same menu has a **Save to file** section with JSON, YAML, and CSV. In the JSON Explorer extension, these open the VS Code save dialog.

## Find your way around

These parts of the explorer help you keep track of where you are:

- The breadcrumb bar above the tree shows the path of the selected node. Click a segment to jump to it, or click **Copy path**.
- The status bar shows the total number of nodes, the number of selected nodes, and the path and type of the selected node.
- The **Pinned** strip above the tree lists pinned nodes with a preview of their current values. Click a pin to jump to its node, remove pins one at a time, or click **Clear all pins**. Pin a node from its hover buttons or its context menu.
- The **Bookmarks** panel lists bookmarked paths. Open it from the toolbar in the tree view. Unlike pins, bookmarks stay hidden until you open the panel.
- **Toggle minimap** in the toolbar shows an overview of the tree beside it when more than 20 rows are visible. Click the minimap to scroll. This is separate from the [response viewer's minimap](/response/response-viewer#minimap), which maps the raw response text.

The desktop app keeps bookmarks and pins after a restart.

## Keyboard shortcuts

These shortcuts work while the explorer has focus. They are fixed and can't be changed in Settings.

| Shortcut | Action |
|----------|--------|
| `Ctrl+F` | Toggle search |
| `Ctrl+/` | Toggle the JSONPath filter |
| `Ctrl+Shift+K` | Toggle the query filter |
| `Ctrl+Shift+T` | Switch between tree and table view |
| `Alt+Z` | Toggle word wrap |
| `Enter` or `Shift+Enter` in the search or query bar | Go to the next or previous match |
| `Escape` in the search, filter, or query bar | Close the bar |
| `Up` and `Down` | Select the previous or next row |
| `Right` | Expand the selected node, or move into it |
| `Left` | Collapse the selected node, or move to its parent |
| `Home` and `End` | Select the first or last row |
| `Enter` or `Space` on a row | Expand or collapse the row |
| `Ctrl+click` | Add or remove a node from the selection |
| `Shift+click` | Select a range of nodes |
| `Ctrl+A` | Select all visible nodes |
| `Escape` | Clear the selection |
