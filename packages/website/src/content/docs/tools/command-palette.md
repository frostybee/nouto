---
title: Command Palette
description: Find requests, execute actions, and navigate your workspace with Nouto's fuzzy search command palette.
sidebar:
  order: 3
---

The Command Palette is a keyboard-driven search overlay for finding requests, running actions, and navigating your workspace. It combines fuzzy search, filter syntax, and frecency-based ranking.

<!-- screenshot: tools/command-palette.png -->
![Command palette overlay showing the fuzzy search input field with categorized results: Actions, Recent, and Switch Request sections](/screenshots/tools/command-palette.png)

## Opening the Palette

Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on macOS). The search input auto-focuses.

## Search Modes

### Empty Query

When the palette opens with no query, it shows:

- **Actions**: the first 10 available actions
- **Recent**: up to 5 recently opened requests, ranked by how often and how recently you opened them

### Action Search (`>` prefix)

Type `>` followed by a keyword to search actions only:

```
>create       → Create-related actions
>import       → Import actions
>export       → Export actions
>settings     → Settings actions
```

### Request Search

Type any text to fuzzy-search across all saved requests. Matches are ranked by a combination of search relevance (70%) and frecency (30%).

Search matches against: request name, URL, method, collection name, query parameters, headers, body content, body JSON keys, and variable references.

Minimum 2 characters required. Typos are tolerated (fuzzy matching with ~20% tolerance).

## Filter Syntax

Narrow results with a single-letter prefix:

| Filter | Scope | Example |
|--------|-------|---------|
| `m:` | HTTP method | `m:POST` |
| `c:` | Collection name | `c:Auth` |
| `s:` | Status code | `s:404` |
| `b:` | Request body | `b:stripe` |
| `h:` | Headers | `h:Authorization` |
| `p:` | Query parameters | `p:userId` |
| `d:` | All fields (deep search) | `d:token` |

Typing a bare HTTP method name (e.g., `GET`, `post`) automatically filters by method without needing the `m:` prefix.

## Match Context

When a match comes from a field other than the request name, a context indicator appears below the result showing where the match was found (e.g., "Matched in: Request Body") with a snippet of the matching content.

## Actions

The palette provides 25 actions across 6 categories:

**Create**: HTTP Request, GraphQL Request, WebSocket, SSE, Folder, Collection, Environment

**Import**: OpenAPI, Postman, Insomnia, Hoppscotch, cURL (`Ctrl+U`), URL

**Export**: Export Collection, Export All Collections

**Edit**: Copy as cURL, Generate Code, Duplicate, Delete, Rename

**Run**: Run Collection, Run Folder, Start Mock Server, Benchmark

**Settings**: Open Settings, Switch Storage Mode, Clear History

## Keyboard Navigation

| Key | Action |
|-----|--------|
| `Arrow Up` / `Arrow Down` | Navigate between results |
| `Enter` | Select the highlighted result |
| `Escape` | Close the palette |

## Frecency Ranking

Results are ranked using a frecency algorithm that combines how often and how recently you opened each request. Requests you use frequently appear higher in the results. Frecency scores decay exponentially: a request opened an hour ago scores ~1.0, 24 hours ago ~0.5, a week ago ~0.1.
