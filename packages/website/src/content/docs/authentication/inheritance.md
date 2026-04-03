---
title: Auth Inheritance
description: Configure authentication once at the collection or folder level and have requests inherit it automatically.
---

Auth inheritance lets you set credentials once on a collection or folder instead of configuring them on every request individually. Requests can inherit from their parent, use their own credentials, or send no auth at all.

<!-- screenshot: authentication/auth-inheritance-collection.png -->
![Collection settings panel showing the auth configuration and inheritance selector](/screenshots/authentication/auth-inheritance-collection.png)

## Inheritance Model

Auth flows down the hierarchy:

```
Collection
  └── Folder
        └── Request
```

Each level can either inherit from its parent or override with its own configuration. A request at the bottom of the chain resolves auth by walking up to the nearest ancestor that has auth configured.

## Auth Modes

Each request and folder has an **Auth** mode selector with three options:

| Mode | Behavior |
|------|----------|
| **Inherit** | Use the auth configured on the nearest parent (folder or collection) |
| **Own** | Use the auth configured directly on this request or folder |
| **None** | Send no auth, even if the parent has auth configured |

## Setting Collection Auth

1. Right-click a collection in the sidebar and open its settings.
2. Click the **Auth** tab.
3. Select an auth type and fill in the credentials.

All requests and folders inside the collection default to **Inherit** mode and will use these credentials.

## Setting Folder Auth

Folders can override the collection's auth for a subset of requests:

1. Right-click a folder and open its settings.
2. Click the **Auth** tab.
3. Set the mode to **Own**, then configure the auth type and credentials.

Requests inside the folder inherit from the folder. The collection's auth is not used for requests in that folder.

<!-- screenshot: authentication/auth-inheritance-folder.png -->
![Folder settings showing Own auth mode with its own credentials, overriding the parent collection](/screenshots/authentication/auth-inheritance-folder.png)

## Request-Level Override

Individual requests can also switch to **Own** mode to use different credentials than their parent, or to **None** to skip auth entirely for that request.

## Nested Folders

Inheritance works through any number of nesting levels. A request in a deeply nested folder walks up the chain until it finds an ancestor with **Own** mode configured, or reaches the collection root.

```
Collection (Bearer token: collection-token)
  └── Folder A (Inherit → uses collection token)
        └── Folder B (Own: Basic auth)
              └── Request 1 (Inherit → uses Folder B's Basic auth)
              └── Request 2 (Own: API Key → uses its own key)
              └── Request 3 (None → sends no auth)
```

## Variable Support in Inherited Auth

Inherited credentials support `{{variable}}` syntax the same as request-level auth. Define the token once in an environment variable, reference it in the collection's auth configuration, and all inheriting requests use the resolved value automatically.

## Postman Compatibility

Postman collection auth and folder auth are preserved during import. Collections and folders with auth configured in Postman import as **Own** mode in Nouto. Requests that inherit from their parent in Postman import as **Inherit** mode.
