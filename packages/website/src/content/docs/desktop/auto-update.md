---
title: Auto-update
description: How the Nouto desktop app checks GitHub Releases for a new version, downloads it, and installs it.
sidebar:
  order: 1
---

The Nouto desktop app checks for a new version each time it starts. When one is available, a banner at the top of the main area lets you install it and restart.

## Install an update

1. Start Nouto. About five seconds after launch, Nouto checks the latest GitHub release of the project.
2. If a newer version exists, Nouto starts downloading it in the background and shows a banner above the request tabs that reads **Update available**, followed by the version number. If the Nouto window isn't focused, you also get a system notification.
3. When the download finishes, the banner reads **Update ready**.
4. Click **Install and Restart**. If the background download hasn't finished, the button reads **Download and Restart** and a progress bar shows the download.

Nouto installs the update and restarts on the new version.

## Dismiss the banner

Click the close icon on the banner to hide it. The banner returns the next time you start Nouto, until you install the update.

## When Nouto checks

Nouto checks once per launch. It doesn't check again while it's running, and the app has no menu command to check manually. To check again, restart Nouto.

If the check fails, for example because you're offline, Nouto doesn't show an error. The next launch checks again.

## Supported installs

| Platform | Auto-update |
|----------|-------------|
| Windows | Yes |
| macOS | Yes |
| Linux AppImage | Yes |
| Linux `.deb` and `.rpm` packages | No. Install new versions through the package file from the [releases page](https://github.com/frostybee/nouto/releases). |

## Update signatures

Nouto reads the update manifest (`latest.json`) from the latest GitHub release and verifies the downloaded update against the public key built into the app. It installs an update only when the signature matches.
