# Nouto brand assets

Master copies of the Nouto logo, favicon, and app icons. This folder is the
single source of truth. Files used elsewhere in the repo are copies.

Copying is manual. After editing a master here, copy it to every destination
listed below.

## Files and their destinations

| Master | Copy to | Used by |
|--------|---------|---------|
| `nouto-app-icon.svg` | — | App icon SVG source (teal variant) |
| `nouto-vscode-icon.svg` | `packages/vscode/images/icon.svg` | VS Code extension sidebar icon |
| `nouto-icon.png` | `packages/vscode/images/icon.png` | VS Code Marketplace listing |
| `nouto-icon.png` | `packages/desktop/src-tauri/icons/icon.png` | Desktop app titlebar icon |
| `nouto-favicon.svg` | `packages/website/public/favicon.svg` | Documentation site favicon |

### Tauri bundle icons (generated from `nouto-icon.png`)

These live in `packages/desktop/src-tauri/icons/` and are referenced by
`packages/desktop/src-tauri/tauri.conf.json`:

| File | Size | Platform |
|------|------|----------|
| `32x32.png` | 32 x 32 | Tauri default |
| `128x128.png` | 128 x 128 | Tauri default |
| `128x128@2x.png` | 256 x 256 | Tauri HiDPI |
| `icon.ico` | multi-res | Windows |
| `icon.icns` | multi-res | macOS |

### JSON Explorer extension

| Master | Copy to | Used by |
|--------|---------|---------|
| `json-explorer-icon.svg` | `packages/json-explorer-ext/images/icon-mono.svg` | Activity bar mono icon |
| `json-explorer-icon.png` | `packages/json-explorer-ext/images/icon.png` | VS Code Marketplace listing |

## Palette

TODO: document brand colours once the icon design is finalized.

## Notes

- Draft/exploration icons live in `my-docs/website/icons/` and are not shipped.
- `archive/` holds discarded icon variants for reference.
