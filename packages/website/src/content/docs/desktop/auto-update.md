---
title: Auto-Update
description: The Nouto desktop app checks for updates automatically and shows an install banner when a new version is available.
sidebar:
  order: 1
---

The Nouto desktop app checks for updates on GitHub Releases. When a new version is available, an update banner appears in the app.

<!-- screenshot: desktop/auto-update-banner.png -->
![Update banner showing the new version number and an "Install and Restart" button](/screenshots/desktop/auto-update-banner.png)

## How It Works

1. On startup, Nouto checks GitHub Releases for a newer version.
2. If an update is available, a banner appears at the top of the window with the new version number.
3. Click **Install and Restart** to download and apply the update.
4. Nouto restarts with the new version.

## Signed Updates

Updates are verified using signed manifests to ensure integrity. The app only installs updates that pass signature verification.

## Update Frequency

The app checks for updates once per launch. There is no background polling while the app is running. Close and reopen Nouto to check again.

## Platforms

Auto-update is available on Windows, macOS, and Linux. The update mechanism uses Tauri's built-in updater plugin, which downloads platform-specific installers from the GitHub release.

## Skipping Updates

You can dismiss the update banner without installing. The banner will reappear on the next launch until the update is applied.
