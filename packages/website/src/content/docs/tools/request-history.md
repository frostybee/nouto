---
title: Request history
description: Find, reopen, and save requests you sent earlier from the History tab, and export your history as JSON or CSV.
sidebar:
  order: 0
---

Nouto records each request you send in the **History** tab of the sidebar. Use the tab to find a request you sent earlier, open it again with the same settings, or save it to a collection. History persists when you restart VS Code or the desktop app.

## Recorded requests

Nouto records every request you send from a request tab, whether or not it's saved in a collection. Each entry stores the method, URL, headers, query parameters, body, auth, status code, response time, and response size. History doesn't store response bodies.

In VS Code, Nouto also records requests that fail before a response arrives. These entries have no status code. The desktop app records only requests that got a response.

## Browse history

Open the **History** tab in the sidebar, next to **Collections** and **Trash**. Entries are grouped under **Today**, **Yesterday**, **This Week**, and **Earlier**. Each entry shows:

- The method badge
- The URL path and query string. Hover to see the full URL.
- The time since you sent it, for example `5m ago`. Hover to see the full date.
- The response time, for example `150ms` or `1.2s`
- The status code, colored by range

More entries load as you scroll down.

## Search, filter, and sort

Type in the search box to find entries whose URL, request name, or method contains the text. Click `.*` to switch to a regular expression search.

The bar under the search box has more filters:

- The method pills (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`) show only entries with the selected methods. Select several to combine them.
- **URL** and **Headers** set which fields the search box checks. Select **Headers** to also match request header names and values.
- The sort button orders entries by **Newest First**, **Oldest First**, **Slowest First**, **Fastest First**, **By Status Code**, or **By Method**.

Click the `×` at the end of the bar to clear the search, method filters, and sort order.

To see the history of one collection, right-click a saved request in the **Collections** tab and select **View Send History**. The History tab then shows only entries sent from that request's collection. Click `×` on the **Filtered** badge to remove the filter.

:::note
In the desktop app, search, method filters, sorting, and **Find Similar** don't change the list. The tab shows every entry.
:::

## Entry actions

Right-click an entry, or click its `...` button, to open the menu:

| Action | Result |
|--------|--------|
| **Open in New Tab** | Opens the request in a new tab with the recorded method, URL, headers, parameters, auth, and body |
| **Copy URL** | Copies the full URL, with variables resolved |
| **Save to Collection** | Saves the request to a collection |
| **Find Similar** | Lists entries with the same URL, ignoring the query string |
| **Delete** | Removes the entry from history |

## Statistics

Click **More actions** (the `...` button in the History toolbar) and select **Statistics**. The view shows the total number of requests, average response time, error rate, the date of the oldest entry, the status code distribution, the most-called endpoints, and requests per day. In VS Code, statistics cover the last 30 days. Select **Statistics** again to return to the list.

## Export and import history

Click **Import / Export** in the History toolbar:

- **Export History** saves your history as JSON or CSV. The CSV file has one row per request with the timestamp, method, URL, status, duration, size, and request name.
- **Import History** reads a JSON file created by **Export History**. Nouto skips entries that are already in your history.

In VS Code, the **Nouto: Export History** and **Nouto: Import History** commands do the same.

## Clear history

To delete every entry, click **More actions** and select **Clear All History**, then confirm. You can't undo this.

## Storage limit

The desktop app keeps the 2,000 most recent entries and drops the oldest entry each time you send a request past that limit. VS Code keeps every entry until you delete it or clear the history.
