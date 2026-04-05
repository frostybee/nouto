---
title: Cookie Script API
description: Read, write, and manage cookies from Nouto scripts using the nt.cookies API.
sidebar:
  order: 2
---

The `nt.cookies` API lets you interact with cookie jars from pre-request and post-response scripts. All methods are async, so use `await`.

## Methods

### Get All Cookies

```javascript
const cookies = await nt.cookies.getAll();
for (const c of cookies) {
  console.log(c.name, '=', c.value, '(domain:', c.domain + ')');
}
```

Returns an array of all cookies across all jars.

### Get Cookies for a URL

```javascript
const cookies = await nt.cookies.getCookiesForUrl('https://api.example.com/users');
const session = cookies.find(c => c.name === 'sessionId');
if (session) {
  console.log('Session:', session.value);
}
```

Returns cookies that match the given URL by domain and path, the same matching logic used during auto-injection.

### Set a Cookie

```javascript
await nt.cookies.setCookie({
  name: 'sessionId',
  value: 'abc123',
  domain: 'api.example.com',
  path: '/',
  secure: true,
  httpOnly: true,
  sameSite: 'Lax'
});
```

Adds a new cookie or updates an existing one with the same name and domain.

### Delete a Cookie

```javascript
await nt.cookies.deleteCookie('api.example.com', 'sessionId');
```

Removes a specific cookie by domain and name.

### Clear All Cookies

```javascript
await nt.cookies.clearAll();
```

Removes every cookie from all jars.

## Cookie Object Shape

```typescript
{
  name: string          // Cookie name
  value: string         // Cookie value
  domain: string        // Domain scope
  path: string          // Path scope
  expires?: number      // Unix timestamp (undefined = session cookie)
  httpOnly?: boolean    // Default: false
  secure?: boolean      // Default: false
  sameSite?: string     // "Strict", "Lax", or "None"
}
```

## Examples

### Extract and reuse a CSRF token

```javascript
// Post-response: save the CSRF token from Set-Cookie
const cookies = await nt.cookies.getCookiesForUrl(nt.request.url);
const csrf = cookies.find(c => c.name === 'csrfToken');
if (csrf) {
  nt.setVar('csrfToken', csrf.value);
}
```

Then in subsequent requests, use `{{csrfToken}}` in a header:
```
X-CSRF-Token: {{csrfToken}}
```

### Set up a session before a test run

```javascript
// Pre-request: inject a known session cookie
await nt.cookies.setCookie({
  name: 'session',
  value: nt.getVar('TEST_SESSION_ID'),
  domain: 'api.example.com',
  path: '/',
});
```

### Clean up after a test

```javascript
// Post-response: remove all cookies after the final request
await nt.cookies.clearAll();
console.log('Cookies cleared');
```

### Log all cookies for debugging

```javascript
const all = await nt.cookies.getAll();
console.log('Total cookies:', all.length);
for (const c of all) {
  console.log(`  ${c.domain}: ${c.name}=${c.value}`);
}
```
