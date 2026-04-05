---
title: Scripts
description: Write pre-request and post-response JavaScript in Nouto to modify requests, extract values, run tests, and chain requests.
sidebar:
  order: 1
---

Scripts let you run JavaScript before a request is sent and after the response is received. Use them to compute dynamic headers, chain values between requests, validate responses programmatically, or control flow in the Collection Runner.

<!-- screenshot: testing/scripts-editor.png -->
![Script editor showing the pre-request and post-response tab buttons, the code editor, and the console output panel with log entries](/screenshots/testing/scripts-editor.png)

## Accessing Scripts

Open a request and click the **Scripts** tab. The tab shows an asterisk when a script is defined.

Two buttons at the top toggle between:

- **Pre-request Script**: runs before the HTTP request is sent
- **Post-response Script**: runs after the response is received

## The `nt` API

Scripts have access to a global `nt` object that provides everything you need to interact with the request and response. The full reference is on the [Script API](/testing/script-api) page.

## Pre-request Scripts

Use pre-request scripts to modify the outgoing request or set up variables.

```javascript
// Add a computed timestamp header
nt.request.setHeader('X-Timestamp', String(Date.now()));

// Compute an HMAC signature
const secret = nt.getVar('apiSecret');
const timestamp = String(nt.timestamp.unix());
const signature = nt.hash.sha256(nt.request.method + nt.request.url + timestamp + secret);
nt.request.setHeader('X-Timestamp', timestamp);
nt.request.setHeader('X-Signature', signature);

// Generate a unique request ID
nt.request.setHeader('X-Request-ID', nt.uuid());
```

`nt.request` is read-write in pre-request scripts. `nt.response` is not available.

## Post-response Scripts

Use post-response scripts to validate the response, extract values for use in later requests, or run tests.

```javascript
// Log response info
console.log('Status:', nt.response.status);
console.log('Duration:', nt.response.duration, 'ms');

// Extract and store a token
const body = nt.response.json();
if (body.token) {
  nt.setVar('authToken', body.token);
}

// Run programmatic tests
nt.test('Status is 200', () => {
  if (nt.response.status !== 200) throw new Error('Expected 200, got ' + nt.response.status);
});

nt.test('Response has users array', () => {
  const data = nt.response.json();
  if (!Array.isArray(data.users)) throw new Error('users is not an array');
});
```

`nt.response` is available in post-response scripts. `nt.request` is read-only.

## Snippet Toolbar

Above the editor, a toolbar provides one-click snippets for common patterns:

**Pre-request snippets:** Set Header, Get Variable, Set Variable, Log, UUID, Base64 Encode

**Post-response snippets:** Test Status, Test Body, Set Variable, Log Response, Hash

Clicking a snippet inserts ready-to-edit code at the cursor position.

## Script Inheritance

Scripts can be defined at three levels: collection, folder, and request. When a request runs, all scripts in the ancestor chain execute in order:

```
Collection pre-request
  → Folder pre-request
    → Request pre-request
      → HTTP Request
    → Request post-response
  → Folder post-response
→ Collection post-response
```

This lets you define shared setup and teardown logic at the collection level (authentication, logging) while keeping request-specific logic at the request level.

If a script in the chain throws an unhandled error, subsequent scripts in that phase are skipped.

## Script Output

After sending a request, a **Scripts** tab appears in the response panel showing:

- **Execution status**: OK or Error for each phase (pre/post)
- **Duration**: script execution time
- **Console output**: all `console.log`, `console.warn`, `console.error`, and `console.info` calls with color-coded levels
- **Test results**: pass/fail list for all `nt.test()` calls, with error messages on failure

<!-- screenshot: testing/scripts-console-output.png -->
![Script output tab showing console log entries, execution duration, and test pass/fail results](/screenshots/testing/scripts-console-output.png)

## Async/Await

Scripts run inside an async context, so you can use `await` directly:

```javascript
await nt.delay(500);
const result = await nt.sendRequest({
  url: 'https://auth.example.com/token',
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: { client_id: nt.getVar('CLIENT_ID'), grant_type: 'client_credentials' }
});
nt.setVar('accessToken', result.json().access_token);
```

## Security

Scripts run in a sandboxed environment:

- No `require()` or module imports
- No access to `process`, file system, or network (except `nt.sendRequest()`)
- No access to `global` or `globalThis`
- 5-second execution timeout per script
- Code generation from strings is disabled (`eval`, `new Function`)
