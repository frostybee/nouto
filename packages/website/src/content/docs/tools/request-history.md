---
title: Request History
description: Browse, search, and analyze your past HTTP requests in Nouto's history drawer with statistics and export.
sidebar:
  order: 0
---

Nouto logs every request you send to a persistent history store. The History tab in the sidebar lets you browse, search, filter, and re-open past requests, even after restarting VS Code or the desktop app.

<!-- screenshot: tools/history-drawer.png -->
![History drawer open in the sidebar showing date-grouped entries with method badges, status codes, and response times, plus the search bar with method filter pills active](/screenshots/tools/history-drawer.png)

## Accessing History

Click the **History** tab in the sidebar (alongside Collections and Variables). Entries are displayed in reverse chronological order, grouped by date:

- **Today**
- **Yesterday**
- **This Week**
- **Earlier**

Each entry shows:

- HTTP method badge (color-coded)
- URL path (truncated, with full URL on hover)
- Response status code (green for 2xx, yellow for 3xx, red for 4xx/5xx)
- Response time (e.g., `150ms`, `1.2s`)
- Relative timestamp (e.g., `5m`, `2h`, `3d`)

## Auto-Logging

Every request is logged automatically, whether it belongs to a collection or is an unsaved draft. Both successful responses and errors are recorded. Error entries show status `0` with the error message.

## Searching and Filtering

### Text Search

Type in the search bar to filter entries by URL, request name, or HTTP method. Search is debounced for responsiveness.

### Method Filters

Click the method pills (GET, POST, PUT, PATCH, DELETE) to toggle filtering by HTTP method. Multiple methods can be active at once. Click again to deselect.

### Deep Search

History search matches against URLs, request names, and methods. When response body saving is enabled (Settings > General), you can also search within response bodies.

## Context Menu

Right-click a history entry for:

- **Open**: re-opens the request in a new panel with the original method, URL, headers, params, auth, and body pre-filled
- **Save to Collection**: save the request to a collection
- **Pin**: mark as a favorite
- **Copy URL**: copy the full request URL
- **Delete**: remove the entry from history

## Statistics

<!-- screenshot: tools/history-stats.png -->
![History statistics panel showing top endpoints chart, status code distribution, average response time, and requests-per-day graph](/screenshots/tools/history-stats.png)

The history statistics panel shows aggregate data across your history:

- **Top endpoints**: most frequently called URLs
- **Status distribution**: breakdown by 2xx, 3xx, 4xx, 5xx
- **Average response time**: across all or filtered entries
- **Requests per day**: volume over time

## Export and Import

Export your full history as a JSONL file for backup, analysis, or sharing. Import a previously exported JSONL file to restore history on a different machine or after a clean install.

## Pagination

History loads 50 entries at a time. A **Load More** button appears at the bottom when additional entries exist.

## Storage Limits

| Limit | Value |
|-------|-------|
| Maximum entries | 10,000 |
| Maximum age | 90 days (auto-pruned on startup) |
| Response body cap | 256 KB per entry (larger bodies are truncated) |

Old entries beyond these limits are pruned automatically.

## Clearing History

Click the trash icon next to the search bar to clear all history. This is permanent.
