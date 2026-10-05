---
title: Command palette
description: Find and open saved requests with fuzzy search and filters in the Nouto command palette.
sidebar:
  order: 3
---

The command palette searches the requests saved in your collections and opens the one you select. It matches request names, URLs, and request contents, and ranks requests you open often and recently higher.

## Open the palette

In the desktop app, press `Ctrl+P` (`Cmd+P` on macOS) or click **Search** in the top toolbar. You can change the shortcut in [Keyboard shortcuts](/settings/keyboard-shortcuts).

In VS Code, use one of these:

- Press `Ctrl+K Ctrl+K` (`Cmd+K Cmd+K` on macOS).
- Run **Nouto: Search Requests** from the VS Code Command Palette.
- In a request tab, click **More actions** (the `...` button next to **Code**) and select **Search requests**.

When a request tab is active, the palette opens on top of it. Otherwise, it opens in its own tab.

## Search for a request

Type at least two characters. Nouto searches these fields of every saved request:

- Request name
- URL
- HTTP method
- Collection name
- Query parameters
- Headers
- Body text and JSON keys in the body
- `{{variable}}` references

Matching tolerates small typos and matches the start of words, so `str` finds `stripe`. A match in the name or URL ranks higher than a match in the body. The palette shows up to 100 results.

When the match comes from a field other than the name, the result shows where it matched, for example `Matched in: Request Body`.

With an empty search box, the palette lists up to five recent requests.

## Filter results

Start the query with a one-letter prefix to narrow the search:

| Prefix | Searches | Example |
|--------|----------|---------|
| `m:` | HTTP method | `m:POST` |
| `c:` | Collection name | `c:Auth` |
| `b:` | Request body | `b:stripe` |
| `h:` | Headers | `h:Authorization` |
| `p:` | Query parameters | `p:userId` |
| `d:` | All fields | `d:token` |

A bare method name, such as `GET` or `post`, filters by method without the `m:` prefix.

The `m:` and `c:` filters use the whole rest of the query as their value. `m:POST stripe` looks for the method `POST STRIPE` and finds nothing, so use `b:stripe` or a plain search instead.

## Keyboard navigation

| Key | Action |
|-----|--------|
| `Up` / `Down` | Move between results |
| `Enter` | Open the highlighted request |
| `Tab` / `Shift+Tab` | Move focus between the search box and results |
| `Escape` | Close the palette |

## Ranking

Nouto keeps a frecency score for each request, based on how often and how recently you opened it from the sidebar or the palette. Search results combine that score with match quality, so a request you open every day ranks above a rarely used request with a similar match. The recent list with an empty search box uses frecency alone.
