---
title: Cookie script API
description: Read, add, and delete cookies in the active Nouto cookie jar from pre-request and post-response scripts with nt.cookies.
sidebar:
  order: 2
---

`nt.cookies` reads and changes the cookies in the active [cookie jar](/tools/cookie-jars) from pre-request and post-response scripts. For the rest of the scripting API, see the [Script API reference](/testing/script-api).

## Calling the methods

How you call the methods depends on where the script runs:

- In VS Code and the CLI, every method returns a promise. Use `await`.
- In the desktop app, every method returns its result directly. Don't use `await`, which is a syntax error at the top level of a desktop script.

The same lookup in each:

```js
// VS Code and the CLI
const cookies = await nt.cookies.getAll();
```

```js
// Desktop app
const cookies = nt.cookies.getAll();
```

The examples on this page use the VS Code form. For the desktop app, remove `await`.

In the desktop app, a script works on a copy of the jar taken when the script starts. Nouto applies the script's changes to the jar after the script finishes. In the CLI, `nt.cookies` works on the run's temporary jar, which starts empty.

## Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `getAll()` | Cookie array | Every cookie in the active jar |
| `get(name)` | Cookie, or `undefined` if none matches. The desktop app returns `null`. | The first cookie with this name, from any domain |
| `getByUrl(url)` | Cookie array | Cookies that match `url`. VS Code uses the same rules as when it sends cookies, described in [How Nouto sends and stores cookies](/tools/cookie-jars/#how-nouto-sends-and-stores-cookies). The desktop app checks only the domain and path, and the CLI checks only the domain. |
| `set(cookie)` | Nothing | Adds a cookie, or replaces the cookie with the same name, domain, and path |
| `delete(domain, name)` | Nothing | Deletes the cookie with this domain and name. In VS Code, it deletes the cookie only when its path is `/`. |
| `clear()` | Nothing | Deletes every cookie in the active jar |

Pass `name`, `value`, `domain`, and `path` to `set()`. In VS Code and the CLI, a cookie without `name` or `domain` throws `nt.cookies.set() requires at least name and domain`.

## Cookie object

`getAll()`, `get()`, and `getByUrl()` return cookies with these fields, and `set()` accepts the same fields:

```ts
{
  name: string;
  value: string;
  domain: string;
  path: string;
  expires?: number;     // milliseconds since the Unix epoch; absent for session cookies
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
}
```

## Examples

Send a CSRF cookie's value as a header. In a pre-request script:

```js
const csrf = await nt.cookies.get('csrfToken');
if (csrf) {
  nt.request.setHeader('X-CSRF-Token', csrf.value);
}
```

For a header like this, `{{$cookie.csrfToken}}` in the **Headers** tab does the same without a script.

Start a request with a known session cookie. In a pre-request script:

```js
await nt.cookies.set({
  name: 'session',
  value: nt.getVar('TEST_SESSION_ID'),
  domain: 'api.example.com',
  path: '/',
  secure: true,
  httpOnly: true,
  sameSite: 'Lax',
});
```

Remove every cookie after the last request of a test. In a post-response script:

```js
await nt.cookies.clear();
```

Log the cookies in the active jar:

```js
const all = await nt.cookies.getAll();
console.log('Total cookies: ' + all.length);
for (const c of all) {
  console.log(c.domain + ': ' + c.name + '=' + c.value);
}
```
