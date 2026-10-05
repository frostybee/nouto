---
title: Variable substitution
description: How Nouto resolves {{variable}} placeholders, which request fields support them, which source wins when names collide, and how to reference responses, cookies, and script values.
sidebar:
  order: 1
---

A variable is a `{{name}}` placeholder that Nouto replaces with a value when you send a request. This page explains where placeholders work, the order in which Nouto looks up a name, and the placeholders that read from responses, cookies, and scripts. To create environments and global variables, see [Environments and global variables](/variables/environments).

## Placeholder types

Every placeholder uses double braces. The text inside determines where the value comes from:

| Placeholder | Value source |
|-------------|--------------|
| `{{name}}` | The active environment, collection or folder variables, global variables, or a linked `.env` file. See [Resolution order](#resolution-order). |
| `{{$namespace.method}}` | A generated value such as a UUID, timestamp, or hash. See [Dynamic variables](/variables/dynamic-variables). |
| `{{$prompt.name}}` | A value you type in a dialog when you send. See [Dynamic variables](/variables/dynamic-variables#prompt-for-a-value-at-send-time). |
| `{{$file.read, path}}` | The content of a file. See [Dynamic variables](/variables/dynamic-variables#read-a-file-at-send-time). |
| `{{$response.path}}` | The most recent response. See [Response values](#response-values). |
| `{{RequestName.$response.path}}` | The response of a specific request. See [Response values from a named request](#response-values-from-a-named-request). |
| `{{$cookie.name}}` | A cookie in the active cookie jar. See [Cookie values](#cookie-values). |

If Nouto can't resolve a placeholder, it sends the placeholder text unchanged, braces included.

## Fields that support variables

Nouto substitutes variables in these parts of an HTTP request:

- The URL, including path parameter values
- Query parameter names and values
- Header names and values, including headers inherited from the collection or folder
- The body, including form fields and GraphQL variables
- On the **Auth** tab: the username, password, token, API key name, and API key value

For WebSocket and Server-Sent Events connections, Nouto substitutes variables in the URL and headers. For gRPC, it substitutes variables in the address, metadata, and message body.

## Resolution order

When the same name is defined in more than one place, Nouto uses the value from the source highest in this list:

1. The active environment
2. Variables on the request's folder, then its parent folders, then the collection. A child folder's value overrides its parent's.
3. Global variables
4. The linked `.env` file

For example, if the global variables define `baseUrl` as `https://api.example.com` and the active environment defines it as `http://localhost:3000`, requests go to `http://localhost:3000`.

Nouto skips variables whose checkbox is cleared. Collection and folder variables apply only to requests saved in that collection. See [Collections](/features/collections) to define them.

## Variable names

Use letters, digits, and underscores in variable names, for example `base_url` or `apiKey2`. The variable editor accepts names with dots and hyphens, such as `api-key`, but Nouto doesn't substitute placeholders with those names. Names are case-sensitive: `{{Token}}` and `{{token}}` are different variables.

## Variables inside variable values

A variable's value can contain other placeholders. For example, define `host` as `api.example.com` and `baseUrl` as `https://{{host}}/v2`. A request to `{{baseUrl}}/users` then goes to `https://api.example.com/v2/users`.

Nouto resolves up to five levels of nested references. A value can also contain a dynamic variable, such as `{{$uuid.v4}}`, which generates a new value on each send.

## Response values

Use `{{$response.path}}` to insert a value from the most recent response, for example a token returned by a login request:

| Placeholder | Value |
|-------------|-------|
| `{{$response.body}}` | The entire response body. A JSON body is inserted as JSON text. |
| `{{$response.body.token}}` | The `token` field of a JSON body |
| `{{$response.body.data[0].id}}` | A nested field, using dot notation and array indexes |
| `{{$response.headers.content-type}}` | A response header. Write the header name in lowercase. |
| `{{$response.status}}` | The status code, for example `200` |
| `{{$response.statusText}}` | The status text, for example `OK` |
| `{{$response.duration}}` | The response time in milliseconds |
| `{{$response.size}}` | The response size in bytes |

Which response counts as most recent depends on where you send from:

- In the VS Code extension, each request opens in its own editor tab. `$response` reads the last response received in the same tab.
- In the desktop app, `$response` reads the last response received in any tab.
- In the [Collection Runner](/testing/collection-runner), `$response` reads the response of the previous request in the run. The runner supports the `body`, `status`, and `headers` paths.

To pass a value from one request to another reliably, save it to a variable in a post-response script with `nt.setVar()`. See [Variables set by scripts](#variables-set-by-scripts).

## Response values from a named request

Prefix `$response` with a request name to read the response of that request:

```text
{{Login.$response.body.token}}
{{Login.$response.status}}
{{CreateUser.$response.body.id}}
```

The name must match the saved request's name exactly, including case. Named references support the `body`, `headers`, `status`, and `statusText` paths. If the named request hasn't run yet, Nouto sends the placeholder unchanged.

Named references are built for the [Collection Runner](/testing/collection-runner), where every request in the run is available. Outside the runner, Nouto finds the named request only if it was sent earlier in the same session. In the VS Code extension, it must also have been sent from the same editor tab.

## Cookie values

Use `{{$cookie.name}}` to insert the value of a cookie from the active [cookie jar](/tools/cookie-jars):

```http
X-CSRF-Token: {{$cookie.csrftoken}}
```

Nouto uses the first cookie with that name in the jar. It doesn't match the cookie's domain or path against the request URL, so use distinct cookie names or a separate jar per API. The Collection Runner doesn't resolve `$cookie` placeholders.

## Variables set by scripts

Scripts save values with `nt.setVar()`. By default the value goes to the active environment. Pass `'global'` as the third argument to save a global variable instead:

```js
// Post-response script: save the token for later requests
nt.setVar('authToken', nt.response.json().token);

// Save a global variable
nt.setVar('tenantId', nt.response.json().tenant, 'global');
```

If no environment is active, Nouto discards values saved without the `'global'` argument.

When the value takes effect depends on how you send the request:

- When you send a single request, Nouto substitutes its variables before the pre-request script runs. A value set in the pre-request script applies from the next send. To change the current request from a pre-request script, modify `nt.request` instead. See the [script API](/testing/script-api).
- In the [Collection Runner](/testing/collection-runner), a value set in a pre-request script applies to the same request.
- A value set in a post-response script applies to every request sent after it.
