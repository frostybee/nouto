---
title: Compare
description: Diff the open JSON document against a second document in the JSON Explorer, with a structural change summary.
sidebar:
  order: 2
---

Click **Compare** (the diff icon) in the explorer toolbar to diff the open document against another JSON document.

:::tip
This compares two arbitrary JSON documents. To compare an HTTP response against the previous response for the same request, use [Response Diff](/response/response-diff) instead.
:::

## Providing the second document

The Compare button opens a panel with a text area. Paste the JSON you want to compare against, or click **Paste from clipboard** to fill the text area automatically. Clipboard access is not available in every VS Code webview context, so pasting into the text area directly always works.

The JSON is validated before the diff runs. If it does not parse, the panel reports the parse error and keeps your text so you can fix it.

## Reading the diff

Click **Compare** in the panel and the explorer switches to the diff view. A summary bar reports the totals:

| Indicator | Meaning |
|-----------|---------|
| `+N added` | Paths present in the second document but not the first |
| `-N removed` | Paths present in the first document but not the second |
| `~N changed` | Paths present in both, with a different value or type |
| `N unchanged` | Paths that are identical in both |

Below the summary, the merged tree marks each node as added, removed, or modified, showing the original and comparison values side by side for changed entries.

## Closing the diff

Close the diff view to discard the comparison document and return to the tree view. Loading a new document also clears the comparison.
