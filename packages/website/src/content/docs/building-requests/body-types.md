---
title: Body Types
description: Configure the request body in Nouto using one of eight body types including JSON, form data, binary file upload, and GraphQL.
sidebar:
  order: 3
---

The **Body** tab in the request editor lets you send data with your request. Nouto supports eight body types to cover every common API format.

<!-- screenshot: building-requests/body-type-dropdown.png -->
![Body tab with the type dropdown open, showing all 8 body type options](/screenshots/building-requests/body-type-dropdown.png)

## Body Types

| Type | Content-Type set | Use for |
|------|-----------------|---------|
| **None** | (none) | GET/DELETE requests with no body |
| **JSON** | `application/json` | REST APIs expecting JSON |
| **XML** | `application/xml` | SOAP services, XML APIs |
| **Text** | `text/plain` | Raw text payloads |
| **Form Data** | `multipart/form-data` | HTML form submissions, file uploads |
| **URL-Encoded** | `application/x-www-form-urlencoded` | Simple form submissions without files |
| **Binary** | Detected from file extension | Single file upload as raw body |
| **GraphQL** | `application/json` | GraphQL queries (see [GraphQL](/features/graphql)) |

Nouto sets the `Content-Type` header automatically when you select a body type. You can override it manually in the Headers tab if needed.

## JSON

<!-- screenshot: building-requests/body-json.png -->
![JSON editor with syntax highlighting and a sample request body](/screenshots/building-requests/body-json.png)

The JSON editor provides syntax highlighting, bracket matching, and auto-formatting. Press `Ctrl+Shift+F` to format the JSON.

Variable substitution (`{{variable}}`) works anywhere in the JSON body, including nested values:

```json
{
  "userId": "{{USER_ID}}",
  "token": "{{AUTH_TOKEN}}",
  "timestamp": "{{$timestamp.iso}}"
}
```

Typing `{{` inside the JSON, Text, or XML body editor triggers autocomplete for all available variables — environment variables, dynamic variables, and faker data generators. Press `Ctrl+Enter` to send the request directly from the body editor.

## Form Data

<!-- screenshot: building-requests/body-form-data.png -->
![Form data editor with text fields and a file field showing a selected file name and size](/screenshots/building-requests/body-form-data.png)

The Form Data editor is a key-value table where each row can be either a text field or a file field:

- Click **Add Field** to add a new row.
- Click the **Text/File** toggle on a row to switch between a text input and a file picker.
- File rows show the selected file name and size inline.
- Rows can be disabled with the checkbox without removing them.

Multiple file fields are supported in the same request. Each file is streamed from disk when the request is sent.

## URL-Encoded

A key-value editor that sends fields as `application/x-www-form-urlencoded`. Suitable for simple form submissions that do not include files.

```
name=John+Doe&age=30&active=true
```

## Binary

Send a single file as the raw request body. Use this for file storage APIs, image upload endpoints, or any service that expects the file content directly.

1. Select **Binary** from the body type dropdown.
2. Click **Browse** or drop a file onto the drop zone.
3. The UI shows the file name, size, and detected MIME type.

Nouto sets `Content-Type` to the file's detected MIME type, or `application/octet-stream` if the extension is not recognized.

Files are read from disk at send time. Only the file path is stored in the collection, not the file contents. If the file is moved or deleted, you will see a "File not found" error when sending.

## Persistence

The body type and content are saved as part of the request when you save to a collection. File fields store the file path only.

## cURL Export

All body types are included in cURL exports:

**JSON:**
```bash
curl -X POST https://api.example.com/data \
  -H 'Content-Type: application/json' \
  -d '{"key": "value"}'
```

**Form Data with file:**
```bash
curl -X POST https://api.example.com/upload \
  -F 'name=John Doe' \
  -F 'avatar=@/path/to/photo.jpg;type=image/jpeg'
```

**Binary:**
```bash
curl -X POST https://api.example.com/upload \
  --data-binary @'/path/to/file.pdf'
```
