---
title: Outline Navigator
description: Sidebar tree for navigating OpenAPI specs by section, with cursor sync, method colors, and context actions.
sidebar:
  order: 5
---

The outline navigator provides a sidebar tree that mirrors the structure of your OpenAPI spec. Click any node to jump to it in the editor. The tree stays in sync with the cursor, highlighting the node nearest to your current position.

<!-- screenshot: openapi/outline-navigator.png -->
![Outline navigator showing paths, operations with method colors, and component sections](/screenshots/openapi/outline-navigator.png)

## Groups

The tree organizes the spec into these top-level groups:

| Group | Contents |
|-------|----------|
| **General** | `openapi` version and `info` block |
| **Servers** | Declared server URLs |
| **Security** | Global security requirements |
| **Tags** | Operations grouped by tag (see below) |
| **Operation ID** | All operations listed alphabetically by `operationId` |
| **Paths** | Path items with their operations |
| **Components** | Each `components` subsection (schemas, security schemes, parameters, responses, etc.) |
| **Webhooks** | Webhook definitions (OpenAPI 3.1 and later) |
| **Referenced Files** | Files referenced via external `$ref`, grouped by target file |

Groups always render in the tree even when the spec does not define that section. This keeps the context menu's "Add" actions reachable so you can scaffold new sections from the outline.

## Visual Cues

### HTTP Method Colors

Operations display a color-coded method badge:

| Method | Color |
|--------|-------|
| GET | Green |
| POST | Yellow |
| PUT | Blue |
| PATCH | Orange |
| DELETE | Red |
| HEAD | Purple |

### Component Icons

Each `components` subsection uses a distinct icon to differentiate schemas, security schemes, parameters, callbacks, and other component types at a glance.

## Navigation

- **Click** a node to reveal it in the editor (scrolls to and selects the node's position)
- **Cursor sync** — as you move the cursor in the editor, the outline highlights the nearest matching node and expands its ancestors
- **Expand/collapse state** is preserved per session across tab switches

## Sorting

Toggle alphabetical sorting for paths, tags, and component items. When sorting is off, items appear in document order. Operations within a path or tag always stay in document order regardless of the sort setting.

## Operations by Tag

The Tags group arranges operations in this order:

1. **Declared tags** — tags listed in the spec's top-level `tags` array, in declaration order
2. **Undeclared tags** — tags used by operations but not declared in the `tags` array
3. **Untagged** — operations with no tags

## Parse Failures

When the spec contains a syntax error that prevents full parsing, the outline explains the problem inline instead of going blank. A warning node describes the parse failure, and the tree continues to show the last successfully parsed structure so you can still navigate to known sections. Once the syntax error is fixed, the outline refreshes with the updated tree.

## Context Menu

Right-click any node to access context actions:

- **Edit actions** — add, rename, or remove sections and items (disabled when the spec has error-level diagnostics)
- **Try It** — available on operation nodes, converts the operation into a prefilled request tab (see [Preview: Try It](/openapi/preview))
