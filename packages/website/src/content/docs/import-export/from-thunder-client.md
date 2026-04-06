---
title: From Thunder Client
description: Switch from Thunder Client to Nouto. Import your collections and environments and continue testing without an account or cloud sync.
sidebar:
  order: 1
---

Nouto is a VS Code-native alternative to Thunder Client with deeper protocol support, a standalone desktop app, and no account or cloud dependency. Your existing Thunder Client data imports in one step.

## What Transfers

| Data | Imported |
|------|----------|
| Collections and folder structure | Yes |
| Requests (method, URL, params, headers, body) | Yes |
| Environments and variables | Yes |
| Auth settings | Yes |
| Request descriptions | Yes |
| Test scripts | No (Thunder Client tests use a different format) |

## Importing from Thunder Client

1. In VS Code with Thunder Client installed, open the Thunder Client sidebar.
2. Click the **...** menu and select **Export** to save your data directory (or export individual collections).
3. In Nouto, open the Command Palette (`Ctrl+Shift+P`) and run **Import Thunder Client**.
4. Select your Thunder Client data directory.

Nouto reads the Thunder Client JSON format directly and recreates your collections, folders, environments, and requests.

## What's Different

Nouto covers everything Thunder Client does, and goes further in several areas:

| Capability | Thunder Client | Nouto |
|-----------|---------------|-------|
| VS Code extension | Yes | Yes |
| Standalone desktop app | No | Yes |
| GraphQL | No | Yes |
| WebSocket | No | Yes |
| Server-Sent Events | No | Yes |
| Collection Runner with data files | No | Yes |
| CLI (`nouto run`) | No | Yes |
| Auth inheritance across folders | No | Yes |
| Pre/post-request scripts | Limited | Full JavaScript sandbox |
| Mock server | No | Yes |
| Benchmarking | No | Yes |
| Open source | No | MIT |
