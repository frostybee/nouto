<div align="center">
  <img src="https://raw.githubusercontent.com/frostybee/nouto/main/packages/json-explorer-ext/images/icon.png" alt="Nouto JSON Explorer" width="128" height="128"/>
</div>

# Nouto JSON Explorer

A JSON exploration tool for Visual Studio Code. Open any JSON file, or paste JSON straight from your clipboard, and navigate it as a collapsible tree or a table. Includes search, JSONPath filtering, bookmarks, and copy support in multiple formats.

## Features

- **Tree view**: Browse JSON as a collapsible node tree. Each node shows its key, type, and value. A breadcrumb bar tracks your position as you go deeper into nested objects.
- **Table view**: View arrays of objects as a table, with each key as a column. Supports column sorting (click a header), column resizing (drag the resize handle, or double-click to auto-fit), and column pinning (pin any column to keep it visible while scrolling horizontally). A status bar shows the row and column count, and updates when search filters are active. Large arrays load in pages of 50 rows, with a button to load more.
- **Fuzzy search**: Filter the tree by key or value as you type, with a history of past searches.
- **JSONPath filtering**: Enter a JSONPath expression to show only matching nodes.
- **Bookmarks**: Pin any node and jump back to it from the bookmark panel.
- **Copy as**: Right-click any node to copy it as formatted JSON, minified JSON, or YAML.

## Opening JSON

**From the file explorer:** Right-click any `.json` file and select **Open with JSON Explorer**.

**From the editor:** Right-click inside an open JSON file and select **Open with JSON Explorer**, or click the JSON Explorer icon in the editor title bar.

**From anywhere on disk:** Click the folder icon in the JSON Explorer sidebar or run **Nouto JSON Explorer: Open JSON File from Disk** from the Command Palette. This works for files outside the current workspace.

**From the clipboard:** Copy any JSON text from a browser, terminal, API response, or any other source. Open the JSON Explorer sidebar and click **Paste JSON**.

## Sidebar

The JSON Explorer sidebar keeps a list of recently opened files. Click any entry to reopen it. Hover over an entry to reveal a remove button.

The sidebar title bar has three icon buttons:

| Icon | Action |
|------|--------|
| Folder | Open a JSON file from disk |
| Clear all | Clear the recent files list |
| Info | Open the About panel |

## Limitations

- Files larger than 20 MB are not supported and will open in the default text editor instead.
- The extension does not modify files. All edits must be made in a text editor.

## Requirements

Visual Studio Code 1.74.0 or later.

## License

MIT
