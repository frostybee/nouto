---
title: Preview
description: Render an OpenAPI spec as interactive documentation with Swagger UI or RapiDoc, send test requests from it, and open it in a browser.
sidebar:
  order: 4
---

The preview renders the current spec as API documentation next to the editor and updates as you edit. To open it:

- In VS Code, click **Open OpenAPI Preview** in the editor title bar or in the OpenAPI Outline title bar, or run **Nouto: Open OpenAPI Preview** from the Command Palette. The preview opens beside the editor.
- In the desktop app, click **Toggle Preview** in the OpenAPI toolbar.

## Renderers

The preview can use one of two renderers:

| Renderer | OpenAPI 3.2 |
|----------|-------------|
| Swagger UI (default) | Supported |
| RapiDoc | Not documented by RapiDoc. The preview shows a warning for 3.2 specs, because parts of the spec may render incorrectly |

Choose the renderer from the **Renderer** dropdown in the preview toolbar.

## Toolbar

The preview toolbar has these controls:

| Control | Action |
|---------|--------|
| **Renderer** | Switch between Swagger UI and RapiDoc |
| **Theme** | Choose **Match VS Code**, **Light**, or **Dark**, as described in [Theme](#theme) |
| **Operation** | Select the operation that **Try It** opens |
| **Try It** | Open the selected operation as an unsaved request with its method, URL, parameters, headers, auth, and body filled in. Nouto does not send the request until you click **Send** |
| **Generate Collection** | Create a collection from the whole spec, with one request per operation. Operations go into one folder per tag, using each operation's first tag. Operations without a tag go to the collection root |
| **Open in Browser** | Open the documentation in your system browser, as described in [Open the documentation in a browser](#open-the-documentation-in-a-browser) |

A badge at the end of the toolbar shows the detected OpenAPI version.

## Theme

**Light** and **Dark** set the preview's colors directly. **Match VS Code** follows the active VS Code color theme: light and high contrast light themes render light, dark and high contrast themes render dark, and the preview switches when you change themes.

In the desktop app, **Match VS Code** always renders the light theme. Select **Dark** for a dark preview.

## Send requests from the documentation

Swagger UI's **Try it out** button and the equivalent feature in RapiDoc send real requests to your API. The preview runs the renderer in a sandbox without network access, so Nouto sends these requests itself: through the extension host in VS Code, and through the app's HTTP client on desktop. Browser CORS rules do not apply. Each request times out after 30 seconds.

In VS Code, set `nouto.openApiPreview.enableTryIt` to `false` to make the preview read-only. The setting is `true` by default.

## Open the documentation in a browser

**Open in Browser** builds a standalone copy of the documentation with the current renderer and opens it in your default browser. The renderer is embedded in the page, so it works offline, and its request-sending features are turned off.

- In VS Code, Nouto writes the page to the extension's storage folder. When you edit the spec, Nouto updates the page's data: the open page refreshes itself where the browser allows it, and otherwise picks up the change when you reload.
- In the desktop app, Nouto writes a single HTML file named `nouto-openapi-docs.html` to the system temp folder. The file does not update when you edit the spec. Click **Open in Browser** again to get a new copy.

## Banners

The preview shows a banner above the documentation in these situations:

| Banner | When it appears |
|--------|-----------------|
| Working… | **Try It** or **Generate Collection** is running |
| Loading renderer… | The renderer is starting |
| OpenAPI 3.2 warning | The spec declares 3.2 and RapiDoc is selected |
| Showing the last valid specification | The document no longer parses as OpenAPI 3.0, 3.1, or 3.2. The preview keeps showing the last version that did |
| Some external references could not be resolved | A cross-file `$ref` target is missing, so the preview may be incomplete |
| Renderer error | The renderer failed, or did not start within 15 seconds |
