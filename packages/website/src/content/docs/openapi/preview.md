---
title: Preview
description: Render OpenAPI specs as interactive API documentation with Swagger UI or RapiDoc, theme support, and Try It.
sidebar:
  order: 4
---

The preview panel renders your OpenAPI spec as interactive API documentation. Open it alongside the editor to see your changes reflected as you type.

<!-- screenshot: openapi/preview-panel.png -->
![Preview panel showing rendered API documentation with the operation picker and toolbar](/screenshots/openapi/preview-panel.png)

## Renderer Engines

Two renderer engines are available:

| Renderer | OpenAPI 3.2 | Notes |
|----------|-------------|-------|
| **Swagger UI** (default) | Supported | The standard OpenAPI documentation renderer |
| **RapiDoc** | Not supported | An alternative renderer with a different visual style. Shows a compatibility warning when the spec uses OpenAPI 3.2 |

Switch between renderers using the dropdown in the preview toolbar.

## Theme

The preview supports three theme modes:

- **Auto** — matches the current app theme (detects light, dark, and high-contrast variants)
- **Light** — forces a light background
- **Dark** — forces a dark background

The theme updates live when you switch the app theme.

## Toolbar

| Action | Description |
|--------|-------------|
| **Renderer** | Switch between Swagger UI and RapiDoc |
| **Theme** | Switch between Auto, Light, and Dark |
| **Operation picker** | Jump to a specific operation by selecting it from the dropdown |
| **Try It** | Convert the selected operation into a prefilled request tab. This creates an unsaved request with the method, URL, and parameters pre-populated. The request is not executed from the preview |
| **Generate Collection** | Create a collection from the entire spec, with one request per operation grouped by tag |
| **Open in Browser** | Build a standalone, self-contained HTML file and open it in your system browser. The exported file includes all assets inline and works offline. Try It is disabled in the browser version since there is no host to proxy requests |
| **Version badge** | Shows the detected OpenAPI version |

## Banners

The preview shows status banners when relevant:

| Banner | When it appears |
|--------|----------------|
| Loading | The renderer is initializing |
| Stale document | The current text does not parse as valid OpenAPI; the preview shows the last valid version |
| OpenAPI 3.2 compatibility | The spec uses 3.2 and the selected renderer does not support it (RapiDoc) |
| Incomplete external refs | Some cross-file `$ref` targets could not be resolved |
| Renderer error | The renderer failed to load or timed out (15-second watchdog) |
