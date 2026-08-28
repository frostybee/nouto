---
title: Themes
description: Choose from 26 built-in themes, browse a catalog of 65 VS Code themes, import theme files, or create custom themes with live WCAG contrast feedback.
sidebar:
  order: 1
---

Nouto ships with 26 built-in themes. In VS Code, themes follow the editor's active color theme. In the Desktop app, you select a theme from the Settings page and can go further: browse and install from a catalog of 65 VS Code themes, import any VS Code theme file, or create a fully custom theme.

## Built-in Themes

### Dark Themes (17)

| Theme | Notes |
|-------|-------|
| Dark | Default dark theme |
| Nord | Arctic blue palette |
| Dracula | Purple-accented dark |
| Solarized Dark | Warm dark with blue-green highlights |
| Monokai | Classic syntax colors |
| GitHub Dark | GitHub's dark mode |
| One Dark Pro | Atom-inspired |
| Catppuccin Frappe | Pastel on dark gray |
| Catppuccin Macchiato | Pastel on darker base |
| Catppuccin Mocha | Pastel on darkest base |
| Ayu Dark | Warm dark |
| Rose Pine | Muted rose tones |
| Rose Pine Moon | Brighter rose variant |
| Tokyo Night | Cool blue and purple |
| Everforest Dark | Earthy green |
| Gruvbox Dark | Retro warm |
| Night Owl | Optimized for low light |

### Light Themes (9)

| Theme | Notes |
|-------|-------|
| Light | Default light theme |
| Solarized Light | Warm light |
| GitHub Light | GitHub's light mode |
| Catppuccin Latte | Pastel on cream |
| Ayu Light | Warm light |
| Rose Pine Dawn | Rose on light base |
| Tokyo Night Day | Light blue |
| Everforest Light | Earthy green on light |

### System

**Auto** follows the OS dark/light preference.

## VS Code Integration

In the VS Code extension, Nouto uses CSS variables from the active VS Code color theme (`var(--vscode-*)`). The theme picker in Settings is available in the Desktop app only. In VS Code, change your theme through VS Code's built-in theme settings and Nouto adapts automatically.

## VS Code Theme Catalog

*Desktop app only.*

The catalog provides 65 curated themes from the VS Code and Shiki ecosystem. Open it from **Browse VS Code Themes** in Settings > Appearance.

- Search by name and filter by **All**, **Dark**, or **Light**
- Each entry shows three color swatches (background, foreground, accent) so you can preview the palette at a glance
- **Install** adds the theme without switching to it; **Install & Use** adds it and activates it immediately
- Already-installed themes show an **Installed** badge and a **Use** button instead

Included families: Catppuccin, Dracula, Everforest, GitHub, Gruvbox, Kanagawa, Material Theme, Nord, One Dark Pro, Rose Pine, Solarized, Tokyo Night, and more.

## Import a Theme File

*Desktop app only.*

You can import any VS Code or Shiki theme JSON/JSONC file from disk. The converter maps VS Code workbench colors to Nouto tokens where possible and derives the rest using the OKLCH color engine (see [Customize a Theme](#customize-a-theme) below). Notes are shown when parts of the theme couldn't be mapped cleanly.

Duplicate detection prevents installing byte-identical themes. When an imported theme's name collides with an existing one, a numeric suffix is appended automatically.

## Customize a Theme

*Desktop app only.*

Any installed, imported, or built-in theme can be forked into an editable custom copy. Click the pencil icon on a theme card in Settings > Appearance to open the inline editor.

The editor exposes three anchor colors and a contrast control:

| Anchor | What it controls |
|--------|------------------|
| **Background** | Editor and window base color |
| **Text** | Primary text color |
| **Accent** | Buttons, links, and focus rings |
| **Contrast** (0-100) | Surface and border separation strength |

The full palette (~38 tokens) is derived from these four anchors using the OKLCH color engine, which guarantees WCAG contrast floors (4.5:1 for text, 3:1 for accent and focus). Live contrast ratio readouts appear next to the Text and Accent fields, showing the ratio and WCAG grade (e.g. "4.8:1 AA", "7.2:1 AAA", or "Low").

When editing a theme imported from a VS Code file, a warning banner notes that anchor edits re-derive the whole palette and drop any pinned VS Code color overrides from the original import.

Custom themes can be renamed or deleted from the same editor panel.

## Editor Syntax Colors

The Monaco editor (used in the OpenAPI editor) and CodeMirror editors both derive their syntax highlighting from the active theme's CSS variables. Custom themes, catalog themes, and imported themes produce correct syntax colors automatically. The editor font size is shared across both editor implementations.
