---
title: Script API Reference
description: Complete reference for the nt API object available in Nouto pre-request and post-response scripts.
sidebar:
  order: 2
---

The `nt` object is available globally in all scripts. This page documents every property and method.

## Request (`nt.request`)

Available in both pre-request (read-write) and post-response (read-only) scripts.

| Property / Method | Type | Pre-request | Post-response | Description |
|-------------------|------|:-----------:|:-------------:|-------------|
| `nt.request.url` | `string` | read/write | read-only | Full request URL |
| `nt.request.method` | `string` | read/write | read-only | HTTP method (`GET`, `POST`, etc.) |
| `nt.request.headers` | `object` | read/write | read-only | Headers as a plain object |
| `nt.request.body` | `any` | read/write | read-only | Request body |
| `nt.request.setHeader(name, value)` | `void` | yes | no | Add or overwrite a request header |
| `nt.request.removeHeader(name)` | `void` | yes | no | Remove a request header |

```javascript
// Pre-request: add a header
nt.request.setHeader('X-Correlation-ID', nt.uuid());

// Pre-request: modify the URL
nt.request.url = nt.request.url + '?debug=true';
```

## Response (`nt.response`)

Available in post-response scripts only.

| Property / Method | Type | Description |
|-------------------|------|-------------|
| `nt.response.status` | `number` | HTTP status code |
| `nt.response.statusText` | `string` | Status text (e.g., `"OK"`) |
| `nt.response.headers` | `object` | Response headers as a plain object |
| `nt.response.body` | `string` | Raw response body |
| `nt.response.duration` | `number` | Request duration in milliseconds |
| `nt.response.json()` | `any` | Parse body as JSON and return the object |
| `nt.response.text()` | `string` | Return body as a string |
| `nt.response.header(name)` | `string \| undefined` | Case-insensitive header lookup |

```javascript
const body = nt.response.json();
console.log('Status:', nt.response.status);
console.log('Content-Type:', nt.response.header('content-type'));
```

## Variables

| Method | Description |
|--------|-------------|
| `nt.getVar(name)` | Read a variable from the active environment, globals, or `.env` file |
| `nt.setVar(name, value)` | Set a variable in the active environment |
| `nt.setVar(name, value, 'global')` | Set a global variable |
| `nt.env.get(key)` | Read from the active environment |
| `nt.env.set(key, value)` | Write to the active environment |
| `nt.globals.get(key)` | Read a global variable |
| `nt.globals.set(key, value)` | Write a global variable |

```javascript
const token = nt.getVar('authToken');
nt.setVar('lastResponseId', nt.response.json().id);
nt.setVar('sharedToken', token, 'global');
```

## Tests

| Method | Description |
|--------|-------------|
| `nt.test(name, fn)` | Register a named test. The function should throw on failure. |

Tests registered with `nt.test()` appear in the Scripts response tab alongside Chai assertion results. You can also use `expect` (Chai) and `assert` (Chai) directly.

```javascript
nt.test('Status is 201', () => {
  if (nt.response.status !== 201) {
    throw new Error('Expected 201, got ' + nt.response.status);
  }
});

// Using Chai
expect(nt.response.status).to.equal(201);
assert.strictEqual(nt.response.json().active, true);
```

## Flow Control

| Method | Description |
|--------|-------------|
| `nt.setNextRequest(nameOrId)` | Jump to a specific request by name in the Collection Runner |
| `nt.setNextRequest(null)` | Stop the Collection Runner after the current request |

```javascript
// Skip to cleanup if the login failed
if (nt.response.status !== 200) {
  nt.setNextRequest('Cleanup');
}
```

## Utilities

### UUID

```javascript
nt.uuid()  // → "f47ac10b-58cc-4372-a567-0e02b2c3d479"
```

### Hashing

```javascript
nt.hash.md5('hello')     // → "5d41402abc4b2a76b9719d911017c592"
nt.hash.sha256('hello')  // → "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
```

### Base64

```javascript
nt.base64.encode('user:pass')    // → "dXNlcjpwYXNz"
nt.base64.decode('dXNlcjpwYXNz') // → "user:pass"
```

### Random

```javascript
nt.random.int(1, 100)       // random integer between 1 and 100
nt.random.float(0.0, 1.0)   // random float
nt.random.string(16)        // random alphanumeric string of length 16
nt.random.boolean()         // true or false
```

### Timestamps

```javascript
nt.timestamp.unix()    // → 1704067200   (seconds since epoch)
nt.timestamp.unixMs()  // → 1704067200000 (milliseconds since epoch)
nt.timestamp.iso()     // → "2024-01-01T00:00:00.000Z"
```

## Async Helpers

| Method | Description |
|--------|-------------|
| `nt.delay(ms)` | Returns a Promise that resolves after `ms` milliseconds |
| `nt.sendRequest(config)` | Send an HTTP request and return the response |

`nt.sendRequest` config:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `url` | `string` | Yes | Request URL |
| `method` | `string` | No | HTTP method (default: `GET`) |
| `headers` | `object` | No | Request headers |
| `body` | `any` | No | Request body |

```javascript
// Fetch a token before the main request
const tokenResponse = await nt.sendRequest({
  url: 'https://auth.example.com/token',
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: {
    client_id: nt.getVar('CLIENT_ID'),
    client_secret: nt.getVar('CLIENT_SECRET'),
    grant_type: 'client_credentials'
  }
});
nt.setVar('accessToken', tokenResponse.json().access_token);
```

## Cookies

| Method | Description |
|--------|-------------|
| `await nt.cookies.getAll()` | Get all cookies across all jars |
| `await nt.cookies.getCookiesForUrl(url)` | Get cookies matching a URL |
| `await nt.cookies.setCookie(cookie)` | Add or update a cookie |
| `await nt.cookies.deleteCookie(domain, name)` | Delete a specific cookie |
| `await nt.cookies.clearAll()` | Clear all cookies |

Cookie object shape:

```typescript
{
  name: string
  value: string
  domain?: string
  path?: string
  expires?: number      // Unix timestamp
  httpOnly?: boolean
  secure?: boolean
  sameSite?: string
}
```

## Console

| Method | Output level |
|--------|-------------|
| `console.log(...)` | Log (default) |
| `console.info(...)` | Info (blue) |
| `console.warn(...)` | Warning (yellow) |
| `console.error(...)` | Error (red) |

All arguments are serialized to strings. Objects are JSON-stringified. Output appears in the Scripts response tab.

## Sandbox Restrictions

Scripts run in a Node.js `vm` context with the following disabled:

- `require`, `module`, `exports`, `__filename`, `__dirname`
- `process`, `global`, `globalThis`
- `setTimeout`, `setInterval`, `setImmediate` and their `clear*` counterparts
- Code generation from strings (`eval`, `new Function`)
- 5-second execution timeout per script
