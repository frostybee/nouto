---
title: Building requests
description: Build an HTTP request in Nouto with the URL bar and the request tabs for query and path parameters, headers, body, auth, and per-request settings.
sidebar:
  order: 0
---

The request editor has a URL bar at the top and a row of tabs below it. Choose a method and URL in the URL bar, fill in the tabs your API needs, then send the request.

## URL bar

Select the method from the dropdown on the left of the URL bar. The list contains `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, and `OPTIONS`. To use another method, select **Custom...**, type the name, and select **OK**. Nouto converts the name to uppercase; it must start with a letter.

Type or paste the URL into the input next to the method. As you type, the URL bar does the following:

- Moves a query string such as `?page=2` into rows on the **Query** tab, and adds path placeholders such as `:id` or `{id}` to the **Path** tab. See [Query and path parameters](/building-requests/params).
- Lists matching variables when you type `{{`, and shows a warning that names any variable Nouto can't resolve. See [Variable substitution](/variables/variable-substitution).
- Suggests URLs from your collections and history after you type two characters.
- Fills in the method, URL, headers, auth, and body when you paste a cURL command.

If the URL has no scheme, for example `api.example.com/users`, Nouto shows **Did you mean https://api.example.com/users?** below the bar. Select the suggestion or press `Ctrl+I` to apply it. To apply these fixes without asking, turn on **Auto-correct URLs** in **Settings > General**. If you send a URL without a scheme, Nouto uses `http://`.

## Request tabs

The tabs below the URL bar hold the rest of the request:

| Tab | Contents |
|-----|----------|
| Query | Query string parameters. See [Query and path parameters](/building-requests/params). |
| Path | Values for path placeholders such as `:id`. The tab label shows how many there are. |
| Headers | Request headers and headers inherited from the collection or folder. See [Headers](/building-requests/headers). |
| Body | The request body. See [Body types](/building-requests/body-types). |
| Auth | Authentication. See [Authentication](/authentication). |
| Tests | Assertions run against the response. See [Assertions](/testing/assertions). |
| Scripts | Pre-request and post-response scripts. See [Scripts](/testing/scripts). |
| Settings | SSL, client certificates, proxy, timeout, and redirects for this request. See [SSL certificates](/building-requests/ssl-certificates), [Proxy](/building-requests/proxy), and [Timeouts and redirects](/building-requests/timeouts-redirects). |
| Examples | Saved example responses. Appears only for requests saved in a collection. See [Response examples](/response/response-examples). |
| Notes | Markdown notes saved with the request. See [Notes](/building-requests/notes). |

When the body type is GraphQL, the **Query** tab is hidden. The **Tests**, **Scripts**, **Examples**, and **Notes** labels change to show that the tab has content: **Tests** and **Examples** add a count, and **Scripts** and **Notes** add an asterisk.

To switch tabs from the keyboard, see [Keyboard shortcuts](/settings/keyboard-shortcuts).

## Send or cancel a request

Select **Send** or press `Ctrl+Enter` (`Cmd+Enter` on macOS). Nouto substitutes variables and path parameters before it sends the request.

While the request is in flight, **Send** changes to **Cancel**. Select **Cancel** or press `Escape` to stop the request.

## Save a request

Press `Ctrl+S` (`Cmd+S` on macOS) to save the request to a collection. For a request that isn't in a collection yet, select **Save** in the URL bar and choose a collection.

When a saved request has unsaved changes, the URL bar shows **Save to Collection** and **Revert to Saved** buttons, and the sidebar shows a dot next to the request name.
