---
title: From cURL, OpenAPI, HAR, and more
description: Import collection files with format detection, import from a URL, and import cURL commands, OpenAPI 3 specs, HAR files, and Nouto exports.
sidebar:
  order: 5
---

This page covers the import paths that work for any supported format, plus the formats without a page of their own: cURL, OpenAPI, HAR, and Nouto's own export format. For other tools, see [From Postman](/import-export/from-postman), [From Thunder Client](/import-export/from-thunder-client), [From Insomnia](/import-export/from-insomnia), [From Hoppscotch](/import-export/from-hoppscotch), and [From Bruno](/import-export/from-bruno).

Every collection import adds new collections next to your existing ones. Nothing is merged or overwritten.

## Import a collection file

**Import Collection** reads a file, detects its format, and imports it. To run it, click **Import / Export** in the Collections toolbar of the sidebar and select **Import Collection**. In VS Code, you can also run **Nouto: Import Collection (Auto-Detect)** from the Command Palette.

The file dialog lists `.json`, `.yaml`, and `.yml` files. The desktop app also lists `.bru` files. Nouto detects these formats:

| Format | VS Code | Desktop app |
|--------|---------|-------------|
| Nouto export | Yes | Yes |
| Postman Collection v2.0 or v2.1 | Yes | Yes |
| OpenAPI 3.x, JSON or YAML | Yes | Yes |
| Insomnia v4 export, JSON or YAML | Yes | Yes |
| Hoppscotch collection | Yes | Yes |
| HAR 1.2 | Yes | Yes |
| Thunder Client export | No | Yes |
| Bruno `.bru` file | No | Yes |

When the format isn't recognized, Nouto shows an error that lists the supported formats. A Postman environment file gets its own error that points you to the environment import. See [Import a Postman environment](/import-export/from-postman#import-an-environment).

## Import from a URL

To import a file that's hosted online, click **Import / Export** in the Collections toolbar and select **Import from URL**, then enter an `http://` or `https://` URL. In VS Code, the **Nouto: Import from URL** command does the same. Nouto downloads the file and detects its format the same way **Import Collection** does. In the desktop app, the downloaded file must be JSON. To import a YAML file such as an OpenAPI spec, download it and use **Import Collection**.

## cURL

Paste a cURL command into the URL bar of a request. Nouto parses it and fills in the method, URL, query parameters, headers, auth, and body of the current request.

The other cURL import paths depend on the platform:

- In VS Code, run **Nouto: Import from cURL** or press `Ctrl+U` (`Cmd+U` on macOS), then paste the command. Nouto asks for a collection and saves the request there, or creates a collection for it.
- In the desktop app, click **Import / Export** in the Collections toolbar and select **Import cURL**. Nouto loads the command into the current request.
- In a request tab, click **More actions** (the `...` button next to **Code**) and select **Import cURL** to load a command into that request.

## OpenAPI

Nouto imports OpenAPI 3.x specifications in JSON or YAML. Swagger 2.0 documents are rejected.

In VS Code, run **Nouto: Import OpenAPI Specification** and choose **From File** or **From URL**. In the desktop app, use [Import Collection](#import-a-collection-file) or [Import from URL](#import-from-a-url).

Nouto creates one collection named after the spec's title and version, with one request per operation:

- Operations are grouped into folders by their first tag. Untagged operations sit at the collection root.
- Path parameters such as `{id}` become `{{id}}` variables.
- The request URLs start with the first server URL in the spec.

To edit an OpenAPI spec, or to generate a collection from the spec you're editing, see [OpenAPI editor](/openapi).

## HAR files

Nouto reads HAR 1.2 files, such as those saved from the browser developer tools, and creates one request for each recorded entry. When the entries come from more than one host, Nouto creates a folder per host. Each request body gets the body type that matches the recorded MIME type.

In VS Code, run **Nouto: Import HAR File**. Its file dialog accepts `.har` and `.json` files.

In the desktop app, use [Import Collection](#import-a-collection-file). Its file dialog doesn't list `.har` files, so rename the file to `.json` first.

## Nouto export files

A Nouto export file holds one or more collections in Nouto's own format, with every setting intact. See [Exporting](/import-export/exporting#nouto-format).

In VS Code, run **Nouto: Import Nouto Collection**. In the desktop app, use [Import Collection](#import-a-collection-file). Nouto gives every imported collection, folder, and request a new ID, so you can import the same file twice without conflicts.
