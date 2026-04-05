---
title: Response Diff
description: Compare two responses side by side in Nouto to spot changes between API versions, environments, or request variations.
sidebar:
  order: 2
---

The response diff view shows two responses side by side with structural highlighting for additions, deletions, and modifications. Use it to compare how an endpoint's output changes between requests.

<!-- screenshot: response/response-diff.png -->
![Side-by-side diff view with green added lines, red deleted lines, and yellow modified lines, with a summary header showing the counts](/screenshots/response/response-diff.png)

## Opening the Diff View

After receiving a response, click **Compare** in the response toolbar. Nouto compares the current response against the previous response for the same request panel.

The diff view opens in place of the body viewer, with the previous response on the left and the current response on the right.

## Diff Highlighting

| Color | Meaning |
|-------|---------|
| Green | Lines added in the current response |
| Red | Lines removed (present in the previous, absent in the current) |
| Yellow | Lines modified between the two responses |

Both panels retain full syntax highlighting for their respective content, so JSON structure remains readable alongside the diff annotations.

## Navigating Changes

The summary header shows the total count of added, removed, and changed lines. Use the **Next Change** and **Previous Change** buttons to jump between diff chunks.

## Closing the Diff View

Click **Close** or click **Compare** again to return to the normal response body view.

## Common Use Cases

**Environment comparison**: Send the same request against a staging URL and a production URL, then compare the responses to verify parity.

**Regression testing**: Run a request before and after a code change to confirm the response structure or values changed as expected.

**Debugging API changes**: Send the same request twice with a variation (different parameter, different body) and compare the outputs.

**Monitoring drift**: Periodically resend a request and use diff to detect unexpected changes in a third-party API's response format.
