---
title: Quick Start
description: Send your first API request in under a minute.
---

## Send Your First Request

1. Open Nouto from the VS Code activity bar (or launch the desktop app)
2. Click **New Request** or press `Ctrl+N`
3. Select `GET` as the method
4. Enter a URL, for example: `https://jsonplaceholder.typicode.com/posts/1`
5. Click **Send** (or press `Ctrl+Enter`)

You should see the JSON response in the response panel.

## Create a Collection

1. Click the **New Collection** button in the sidebar
2. Give it a name (e.g., "My API")
3. Right-click the collection to add requests or folders
4. Press `Ctrl+S` to save a request to the collection

## Use Environment Variables

1. Open the Environments panel
2. Create a new environment (e.g., "Development")
3. Add a variable: `baseUrl` = `https://jsonplaceholder.typicode.com`
4. In your request URL, use: `{{baseUrl}}/posts/1`
5. Activate the environment and send the request
