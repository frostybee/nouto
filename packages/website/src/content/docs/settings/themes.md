---
title: Themes
description: Pick one of 26 built-in themes in the Nouto desktop app, install themes from a catalog of 65 VS Code themes, import theme files, or build a custom theme with live contrast checks.
sidebar:
  order: 1
---

In the VS Code extension, Nouto uses the colors of your active VS Code color theme. To change how Nouto looks there, change the VS Code theme.

The desktop app has its own theme picker in **Settings > Appearance**. It ships 26 built-in themes, and you can install themes from a catalog of 65 VS Code themes, import a VS Code theme file, or customize any theme. Everything else on this page applies to the desktop app only.

## Built-in themes

**System (Auto)** follows your operating system's light or dark preference. The other built-in themes are fixed.

The 17 dark themes are listed in this table:

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
| Catppuccin Macchiato | Pastel on a darker base |
| Catppuccin Mocha | Pastel on the darkest base |
| Ayu Dark | Warm dark |
| Rose Pine | Muted rose tones |
| Rose Pine Moon | Brighter rose variant |
| Tokyo Night | Cool blue and purple |
| Everforest Dark | Earthy green |
| Gruvbox Dark | Retro warm |
| Night Owl | Tuned for low light |

The 9 light themes are listed in this table:

| Theme | Notes |
|-------|-------|
| Light | Default light theme |
| Solarized Light | Warm light |
| GitHub Light | GitHub's light mode |
| Catppuccin Latte | Pastel on cream |
| Ayu Light | Warm light |
| Rose Pine Dawn | Rose on a light base |
| Tokyo Night Day | Light blue |
| Everforest Light | Earthy green on light |
| Gruvbox Light | Retro warm on light |

## Install a theme from the VS Code catalog

The catalog holds 65 themes from the VS Code and Shiki ecosystems, including Catppuccin, Dracula, Everforest, GitHub, Gruvbox, Kanagawa, Material Theme, Nord, One Dark Pro, Rose Pine, Solarized, and Tokyo Night variants.

1. In **Settings > Appearance**, click **Browse VS Code themes**.
2. Search by name, or filter the list with **All**, **Dark**, or **Light**. Each entry shows background, foreground, and accent swatches.
3. Click **Install** to add the theme without switching to it, or **Install & Use** to add it and switch to it.

Themes you have already installed show an **Installed** label and a **Use** button. Installed catalog themes appear in the **Custom Themes** group in **Settings > Appearance**.

## Import a theme file

To use a VS Code or Shiki theme that isn't in the catalog, click **Import theme file…** in **Settings > Appearance** and select the theme's JSON or JSONC file.

Nouto maps the theme's VS Code workbench colors to its own color tokens where it can, and derives the rest from the theme's background, text, and accent colors. If the text color has less than 4.5:1 contrast against the background, Nouto adjusts it toward that ratio and keeps its hue. A message lists any parts of the theme that didn't map cleanly.

If an imported theme has the same colors as a theme you already installed, Nouto reuses the installed theme instead of adding a duplicate. If its name clashes with an existing theme, Nouto adds a number to the new theme's name, for example `Nord (2)`.

## Customize a theme

Built-in themes can't be edited directly. Nouto makes an editable copy instead.

1. Select the theme you want to start from.
2. In **Settings > Appearance**, click **Customize current theme**. For a custom theme, the button reads **Edit current theme**, and you can also click the pencil icon on its card.
3. Adjust the colors in the editor that opens. Changes apply as you make them.

The editor has four controls:

| Control | What it sets |
|---------|--------------|
| **Background** | Editor and window base color |
| **Text** | Primary text color |
| **Accent** | Buttons, links, and focus rings |
| **Contrast** | Separation between surfaces and borders, from 0 to 100 |

Nouto derives the full palette of 38 color tokens from these four values. Next to **Text** and **Accent**, a readout shows the contrast ratio against the background and a grade, for example `4.8:1 AA`, `7.2:1 AAA`, or `Low`. Text needs at least 4.5:1 contrast and the accent needs at least 3:1. Nouto rejects colors below those ratios and shows a message that explains the problem.

If the theme came from a VS Code theme file, it can carry colors pinned from the original file. A note in the editor warns that changing any value re-derives the whole palette from the four controls.

Rename a custom theme in the name field at the top of the editor, or remove it with **Delete theme**.

## Code editor colors

The code editors in Nouto, including the Monaco editor in the desktop OpenAPI editor, take their syntax colors from the active theme. Catalog, imported, and custom themes color code without extra setup. The editor font and size set in **Settings > Interface** apply to every code editor.
