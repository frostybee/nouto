---
title: Command Palette
description: Find saved requests with Nouto's fuzzy search command palette.
sidebar:
  order: 3
---

The Command Palette is a keyboard driven search overlay for finding saved requests. It combines fuzzy search, filter syntax, match context, and frecency based ranking.

## Opening the Palette

Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on macOS). The search input auto-focuses.

## Search Modes

### Empty Query

When the palette opens with no query, it shows recently opened requests ranked by how often and how recently you opened them.

### Request Search

Type any text to fuzzy-search across all saved requests. Matches are ranked by a combination of search relevance and frecency.

Search matches against request name, URL, method, collection name, query parameters, headers, body content, body JSON keys, and variable references.

Minimum 2 characters are required. Typos are tolerated by fuzzy matching.

## Filter Syntax

Narrow results with a single letter prefix:

| Filter | Scope | Example |
|--------|-------|---------|
| `m:` | HTTP method | `m:POST` |
| `c:` | Collection name | `c:Auth` |
| `s:` | Status code | `s:404` |
| `b:` | Request body | `b:stripe` |
| `h:` | Headers | `h:Authorization` |
| `p:` | Query parameters | `p:userId` |
| `d:` | All fields | `d:token` |

Typing a bare HTTP method name, such as `GET` or `post`, automatically filters by method without needing the `m:` prefix.

## Match Context

When a match comes from a field other than the request name, a context indicator appears below the result showing where the match was found, for example "Matched in: Request Body".

## Keyboard Navigation

| Key | Action |
|-----|--------|
| `Arrow Up` / `Arrow Down` | Navigate between results |
| `Enter` | Select the highlighted result |
| `Escape` | Close the palette |

## Frecency Ranking

Results are ranked using a frecency algorithm that combines how often and how recently you opened each request. Requests you use frequently appear higher in the results.
