# Changelog

All notable changes to the Nouto JSON Explorer VS Code extension will be documented in this file.

## [Unreleased]

## [0.2.0] - 2026-08-11

### Added

- **Sort keys toggle**: toolbar button that reorders object keys alphabetically in the tree view without touching the document itself; table view, search, diff, and copy keep the original order
- **Open subtree in new tab**: right-click any object or array and open it as its own explorer panel, titled with the node path
- **Embedded JSON detection**: string values that parse as a JSON object or array show an inline JSON badge, with a context menu action to open the parsed value in a new panel
- **JSONL / NDJSON support**: open `.jsonl` and `.ndjson` files as an array with one element per line; blank lines are skipped and a malformed line reports an error with its line number, including on live file updates
- **Compare against a file**: a "Choose file..." button in the compare dialog picks a JSON file from disk and diffs it exactly like the paste flow; unreadable or invalid files show an error without closing the dialog
- **JSON Schema validation**: paste a JSON Schema into the new schema panel to validate the document; failing nodes are marked in the tree, the panel lists path and message per violation with click-to-navigate, and clearing the schema removes all marks
- **Query filter**: filter the tree and table with a field comparison language (`=`, `!=`, `>`, `<`, `>=`, `<=`, `~` regex, `contains`, `startsWith`, `endsWith`, combined with `AND`, `OR`, `NOT`, and parentheses) opened with `Ctrl+Shift+K`, with a slide-out Query Reference panel and next/previous match navigation
- **Compare**: diff the loaded document against a second JSON document pasted into the compare dialog, with an added/removed/changed/unchanged summary and per-node change indicators
- **Generate types**: produce TypeScript, Zod, Rust, Go, Python, or JSON Schema definitions from the whole document or the selected node
- **Statistics**: key, object, array, depth, and value counts with a type distribution breakdown, array and string length stats, and a unique key list
- **Minimap**: canvas overview of the document with a viewport indicator and click to scroll, shown for documents with more than 20 visible nodes
- **Pinned nodes**: pin nodes from the row hover button or context menu into an always visible Pinned strip with live value previews, separate from the Bookmarks panel and persisted across sessions
- **Timestamp detection**: Unix seconds, Unix milliseconds, and ISO 8601 values show an inline formatted date hint and hover tooltip in tree rows and table cells
- **Multi-select**: `Ctrl`/`Cmd`+click to toggle nodes, `Shift`+click to select a range, `Ctrl+A` to select all visible nodes, and `Escape` to clear, with a selection count in the status bar and bulk copy and bookmark actions in the context menu
- **More copy formats**: copy as CSV, TypeScript, Python, PHP array, or Markdown table in addition to JSON and YAML, plus a Save to File action for JSON, YAML, and CSV
- **Sidebar context menu**: right-click recent files to copy the path or URL, open a URL in the browser, edit a URL in the fetch form, or remove the entry
- **Sidebar About improvements**: separate "Report a Bug" and "Request a Feature" buttons linking directly to the GitHub issue templates; larger version number display; more visible "Done" button

### Changed

- **Table view pinning**: replaced the fixed first data column with user-toggleable per-column pinning, and added a dedicated CSV export button and timestamp hints in cells
- **Fetched URL tab titles**: tabs now show the hostname and path (e.g. `api.tvmaze.com/shows`) instead of just the hostname
- **Default context menu**: suppressed the browser's default right-click menu in the sidebar webview

## [0.1.0] - 2026-04-15

Initial release.

### Features

- **Tree view**: browse JSON as a collapsible node tree with breadcrumb navigation
- **Table view**: display arrays of objects as a sortable, resizable table with column pinning and double-click auto-fit
- **Fuzzy search**: filter the tree by key or value with search history
- **JSONPath filtering**: show only nodes matching a JSONPath expression
- **Bookmarks**: pin nodes and jump back to them from the bookmark panel
- **Copy as**: copy any node as formatted JSON, minified JSON, or YAML
- **Sidebar**: recent files list, open from disk, paste JSON from clipboard, and About panel
- **Open from anywhere**: open `.json` files from the file explorer, editor tabs, editor context menu, command palette, or disk browser
- **Context menu**: right-click nodes to copy, bookmark, or expand/collapse
