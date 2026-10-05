---
title: Body types
description: Choose a request body type in Nouto, including JSON, XML, text, form data with file fields, URL-encoded fields, a binary file, or GraphQL.
sidebar:
  order: 3
---

Set the request body on the **Body** tab. Select a body type from the row of buttons at the top of the tab, then enter the content for that type. Nouto saves the body type and content with the request.

## `Content-Type` for each body type

Nouto sets the `Content-Type` header from the body type and shows it as an **AUTO** row on the **Headers** tab:

| Body type | `Content-Type` |
|-----------|----------------|
| None | Not set |
| JSON | `application/json` |
| Text | `text/plain` |
| XML | `application/xml` |
| Form Data | `multipart/form-data`, with a generated boundary |
| URL Encoded | `application/x-www-form-urlencoded` |
| Binary | The file's MIME type, detected from its extension, or `application/octet-stream` |
| GraphQL | `application/json` |

To send a different `Content-Type`, add the header on the **Headers** tab. Don't do this for Form Data, because the generated value includes the multipart boundary that the server needs.

Only the selected body type is sent. Nouto sends the body with any method, including `GET`.

## JSON

The JSON editor has syntax highlighting, bracket matching, and a toolbar with these controls:

- **Auto-format** reformats valid JSON shortly after you stop typing or paste. It's on by default.
- **Format** and **Minify** reformat the body once.
- **Wrap** toggles line wrapping. The zoom buttons change the editor's font size.

When the body isn't valid JSON, the parse error appears above the editor. Nouto skips this check while the body contains `{{variables}}`, because the text becomes valid JSON only after substitution.

Variables work anywhere in the body, including nested values:

```json
{
  "userId": "{{USER_ID}}",
  "token": "{{AUTH_TOKEN}}",
  "timestamp": "{{$timestamp.iso}}"
}
```

In the JSON, Text, and XML editors, typing `{{` lists your environment variables and the [dynamic variables](/variables/dynamic-variables). Press `Ctrl+Enter` (`Cmd+Enter` on macOS) to send the request without leaving the editor.

## Text and XML

The Text editor sends its content as typed. The XML editor adds **Format** and **Minify** buttons that re-indent or collapse the markup.

## Form Data

Form Data sends `multipart/form-data`. Each row is either a text field or a file field.

1. Select **Form Data**.
2. Select **Add Field** and enter the field name.
3. For a text field, enter the value. For a file field, select the **Text** button on the row to switch it to **File**, then select **Browse** and choose the file. The row shows the file name and size.

Add as many file fields as you need. Select the check icon at the start of a row to disable it without removing it.

The request stores the file path, not the file contents. Nouto reads each file when you send the request. If a file no longer exists at that path, Nouto sends the request without that field.

## URL Encoded

URL Encoded sends the enabled rows as `application/x-www-form-urlencoded`. Use it for forms without file uploads. For example, three rows named `name`, `age`, and `active` produce this body:

```text
name=John+Doe&age=30&active=true
```

## Binary

Binary sends one file as the raw request body, for example to a file storage or image upload endpoint.

1. Select **Binary**.
2. Select the **Click to select a file** area and choose the file.

Nouto shows the file name, size, and detected MIME type. To pick another file, select **Change file**; to clear it, select **Remove file**.

The request stores the file path, not the file contents. Nouto reads the file when you send the request. If the file was moved or deleted, the request fails with a file error and isn't sent.

## GraphQL

Selecting **GraphQL** switches a `GET` request to `POST` and hides the **Query** tab. Nouto sends the query, variables, and operation name as a JSON object. See [GraphQL](/features/graphql) for the editor and schema features.

## Body in generated code

To see the body as a cURL command or a code snippet, select **Code** in the URL bar. For JSON, Text, XML, URL Encoded, and GraphQL bodies, generated code includes the body only when the method is `POST`, `PUT`, or `PATCH`. See [Code generation](/tools/code-generation).
