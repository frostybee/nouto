---
title: Script API reference
description: Reference for the nt object, Chai assertions, and console in Nouto pre-request and post-response scripts, including the differences between VS Code and the desktop app.
sidebar:
  order: 2
---

Every script runs with a global `nt` object, the Chai helpers `expect` and `assert`, and a `console` object. To learn how to add scripts to a request, see [Scripts](/testing/scripts).

Nouto runs scripts in two engines. The VS Code extension and the CLI use a Node.js `vm` sandbox. The desktop app uses QuickJS. Most members behave the same in both. Where they differ, the entry says so, and [Platform differences](#platform-differences) lists every difference in one place.

## Request (`nt.request`)

`nt.request` describes the request. In a pre-request script, changes to it apply to the request that Nouto sends. In a post-response script, it describes the request that was sent, and changes have no effect.

| Member | Type | Description |
|--------|------|-------------|
| `nt.request.url` | `string` | Request URL. Assign a new value to change it. |
| `nt.request.method` | `string` | HTTP method, such as `GET` or `POST`. Assign a new value to change it. |
| `nt.request.headers` | `object` | Enabled request headers as a plain object |
| `nt.request.body` | `any` | Request body. Assign a new value to change it. Not available in the desktop app. |
| `nt.request.setHeader(name, value)` | `void` | Adds a header, or replaces the value of an existing one |
| `nt.request.removeHeader(name)` | `void` | Deletes a header from `nt.request.headers` |

:::caution
`removeHeader()` doesn't remove a header that the request already has. It only undoes a `setHeader()` call made earlier in the same script.
:::

This pre-request script adds a correlation ID header:

```js
nt.request.setHeader('X-Correlation-ID', nt.uuid());
```

## Response (`nt.response`)

`nt.response` is available in post-response scripts. In pre-request scripts it's `undefined`.

| Member | Type | Description |
|--------|------|-------------|
| `nt.response.status` | `number` | HTTP status code |
| `nt.response.statusText` | `string` | Status text, for example `OK` |
| `nt.response.headers` | `object` | Response headers as a plain object |
| `nt.response.body` | `any` | Response body as received. Use `json()` or `text()` when you need a specific type. |
| `nt.response.duration` | `number` | Response time in milliseconds |
| `nt.response.json()` | `any` | Parses the body as JSON. Throws if the body isn't valid JSON. |
| `nt.response.text()` | `string` | Returns the body as a string |
| `nt.response.header(name)` | `string \| undefined` | Returns a header value. The name is case-insensitive. |

```js
const body = nt.response.json();
console.log('Users returned: ' + body.users.length);
console.log('Content-Type: ' + nt.response.header('content-type'));
```

## Variables

Scripts read and write the variables of the active environment and the global variables. They don't see collection variables, folder variables, or `.env` file variables.

| Member | Description |
|--------|-------------|
| `nt.getVar(name)` | Returns the value from the active environment, or from the global variables when the environment doesn't define it. Returns `undefined` when neither defines it. |
| `nt.setVar(name, value)` | Sets a variable in the active environment |
| `nt.setVar(name, value, 'global')` | Sets a global variable |
| `nt.env.get(key)` | Same as `nt.getVar(key)` |
| `nt.env.set(key, value)` | Same as `nt.setVar(key, value)` |
| `nt.globals.get(key)` | Same as `nt.getVar(key)`. When the active environment defines the same key, it returns the environment value. |
| `nt.globals.set(key, value)` | Same as `nt.setVar(key, value, 'global')` |

Pass strings as values. Convert numbers and objects with `String()` or `JSON.stringify()` first.

A value that a script sets is available to the scripts that run after it for the same request. When you send a request from the request editor, Nouto then saves the value to the active environment or to the global variables. In a collection run, the value carries over to the requests that run after it.

:::caution
Select an active environment before you call `nt.setVar(name, value)`. Without one, Nouto discards environment variables that scripts set. Global variables are saved either way.
:::

```js
const token = nt.getVar('authToken');
nt.setVar('lastUserId', String(nt.response.json().id));
nt.setVar('sharedToken', token, 'global');
```

## Tests

`nt.test(name, fn)` runs `fn` right away. If `fn` returns, Nouto records a passed test. If `fn` throws, Nouto records a failed test with the error message.

Pass a synchronous function. Nouto doesn't wait for a returned promise, so a failure inside an `async` function isn't recorded.

Inside `fn`, throw an error yourself or use the Chai helpers `expect` and `assert`:

```js
nt.test('Status is 201', () => {
  if (nt.response.status !== 201) {
    throw new Error('Expected 201, got ' + nt.response.status);
  }
});

nt.test('User is active', () => {
  expect(nt.response.status).to.equal(201);
  assert.strictEqual(nt.response.json().active, true);
});
```

In VS Code and the CLI, `expect` and `assert` are [Chai](https://www.chaijs.com/api/). The desktop app provides a smaller set, listed under [Platform differences](#platform-differences).

The response panel lists the results of post-response tests on the **Scripts** tab. In the Collection Runner, a failed test in either script marks the request as failed.

## Flow control

`nt.setNextRequest(nameOrId)` sets the request that the Collection Runner runs next. Pass the request's name or its ID. If no request in the run matches, the runner continues with the next request in order. Outside the Collection Runner, the call has no effect.

```js
// Post-response: skip to the cleanup request if login failed
if (nt.response.status !== 200) {
  nt.setNextRequest('Cleanup');
}
```

See [Flow control](/testing/collection-runner/#flow-control) for how the runner handles jumps and loops.

## Run information (`nt.info`)

`nt.info` describes the current run.

| Member | Type | Description |
|--------|------|-------------|
| `nt.info.requestName` | `string` | Name of the current request |
| `nt.info.collectionName` | `string` | Name of the collection. Set only in Collection Runner runs in VS Code and the CLI. |
| `nt.info.currentIteration` | `number` | Zero-based index of the current iteration. `0` when you send a single request. |
| `nt.info.totalIterations` | `number` | Number of iterations in the run. `1` when you send a single request. |

## Utilities

The utility members return values directly in both engines.

| Member | Returns |
|--------|---------|
| `nt.uuid()` | A random UUID v4 |
| `nt.hash.md5(str)` | MD5 hash of `str` as a hex string |
| `nt.hash.sha256(str)` | SHA-256 hash of `str` as a hex string |
| `nt.base64.encode(str)` | `str` encoded as Base64 |
| `nt.base64.decode(str)` | `str` decoded from Base64 |
| `nt.random.int(min, max)` | A random integer from `min` to `max`, inclusive |
| `nt.random.float(min, max)` | A random number from `min` up to, but not including, `max` |
| `nt.random.string(length)` | A random string of `length` letters and digits |
| `nt.random.boolean()` | `true` or `false` |
| `nt.timestamp.unix()` | Current time in seconds since the Unix epoch |
| `nt.timestamp.unixMs()` | Current time in milliseconds since the Unix epoch |
| `nt.timestamp.iso()` | Current time as an ISO 8601 string |
| `nt.getProcessEnv(name)` | Value of an environment variable of the process that runs Nouto: the VS Code extension host or the CLI. Not available in the desktop app. |

```js
nt.hash.md5('hello');          // "5d41402abc4b2a76b9719d911017c592"
nt.hash.sha256('hello');       // "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
nt.base64.encode('user:pass'); // "dXNlcjpwYXNz"
nt.base64.decode('dXNlcjpwYXNz'); // "user:pass"
```

## Delays and HTTP calls

`nt.delay(ms)` pauses the script:

- In VS Code and the CLI, it returns a promise. Use `await nt.delay(500)`.
- In the desktop app, it blocks for `ms` milliseconds and returns nothing. Delays longer than 25,000 ms are cut to 25,000 ms. Call it without `await`.

`nt.sendRequest(config)` sends an HTTP request from a script. It's available only in the desktop app. In VS Code and the CLI, calling it throws `nt.sendRequest() is not available in this context`.

In the desktop app, `nt.sendRequest()` returns the response directly. It accepts these `config` fields:

| Field | Type | Description |
|-------|------|-------------|
| `url` | `string` | Request URL. Required. |
| `method` | `string` | HTTP method. Defaults to `GET`. |
| `headers` | `object` | Request headers |
| `body` | `string` or `object` | Request body. Nouto sends an object as JSON text but doesn't add a `Content-Type` header, so set one yourself. |
| `auth` | `object` | `{ type: 'bearer', token }` or `{ type: 'basic', username, password }` |
| `timeout` | `number` | Timeout in milliseconds. Defaults to `30000`. |
| `ssl` | `object` | `{ rejectUnauthorized: false }` skips certificate verification. Use it only for test servers with self-signed certificates. |
| `proxy` | `object` | `{ protocol, host, port, username, password }` |

The returned object has `status`, `statusText`, `headers`, `body` (a string), `duration`, `json()`, and `text()`. Its `json()` returns `null` when the body isn't valid JSON. When the request fails, for example on a connection error, `nt.sendRequest()` doesn't throw. It returns an object with only an `error` message.

This desktop pre-request script fetches an access token before the main request:

```js
const res = nt.sendRequest({
  url: 'https://auth.example.com/token',
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: {
    client_id: nt.getVar('CLIENT_ID'),
    client_secret: nt.getVar('CLIENT_SECRET'),
    grant_type: 'client_credentials',
  },
});

if (res.error) {
  throw new Error('Token request failed: ' + res.error);
}
nt.setVar('accessToken', res.json().access_token);
```

## Cookies (`nt.cookies`)

`nt.cookies` reads and changes the cookies in the active cookie jar. In VS Code and the CLI, its methods return promises, so use `await`. In the desktop app, they return results directly.

| Method | Description |
|--------|-------------|
| `nt.cookies.getAll()` | All cookies in the active jar |
| `nt.cookies.get(name)` | The first cookie with this name |
| `nt.cookies.getByUrl(url)` | Cookies that match the URL |
| `nt.cookies.set(cookie)` | Adds or replaces a cookie |
| `nt.cookies.delete(domain, name)` | Deletes a cookie |
| `nt.cookies.clear()` | Deletes every cookie in the active jar |

See [Cookie script API](/tools/cookie-script-api) for the cookie object, matching rules, and examples.

## Console

| Method | Level |
|--------|-------|
| `console.log(...)` | `log` |
| `console.info(...)` | `info` |
| `console.warn(...)` | `warn` |
| `console.error(...)` | `error` |

Output appears on the response panel's **Scripts** tab, labeled with its level. In the Collection Runner, it appears under **Script Logs** in the request's expanded row.

In VS Code and the CLI, Nouto converts arguments that aren't strings with `JSON.stringify()`. In the desktop app, pass only strings, for example `console.log('Status: ' + nt.response.status)`.

## Sandbox and limits

Scripts can't load modules or reach the file system.

In VS Code and the CLI:

- `require`, `module`, `exports`, `__filename`, `__dirname`, `process`, and `global` are `undefined`.
- `setTimeout`, `setInterval`, `setImmediate`, and their `clear` functions are `undefined`. Use `nt.delay()` instead.
- `eval()` and `new Function()` throw, because code generation from strings is disabled.
- The synchronous part of a script can run for 5 seconds. The whole script, including awaited work, can run for 30 seconds before it fails with `Script timed out after 30s`.

In the desktop app:

- Scripts have no Node.js or browser APIs, such as `require`, `process`, `fetch`, or timers.
- A script can run for 30 seconds and use 32 MB of memory.

## Platform differences

This table lists every behavior that differs between the VS Code extension or CLI and the desktop app.

| Feature | VS Code and CLI | Desktop app |
|---------|-----------------|-------------|
| `await` | Allowed at the top level of a script | Not supported. A top-level `await` is a syntax error. Write scripts as synchronous code. |
| `nt.cookies.*` | Returns promises | Returns results directly |
| `nt.delay(ms)` | Returns a promise | Blocks, up to 25,000 ms |
| `nt.sendRequest()` | Not available | Available |
| `nt.getProcessEnv()` | Available | Not available |
| `nt.request.body` | Available | Not available |
| `nt.request.headers` in post-response scripts | Available | Not available |
| `console` arguments | Any value | Strings only |
| `nt.getVar()` after `nt.setVar()` in the same script | Returns the new value | Returns the value from before the script ran |
| `nt.timestamp.iso()` format | Milliseconds and a `Z` suffix, for example `2024-01-01T00:00:00.000Z` | Up to nine fractional digits and a `+00:00` offset |
| `expect` | Full Chai `expect` | `equal`, `equals`, `eql`, `include`, `contains`, `above`, `below`, `least`, `most`, `lengthOf`, `length`, `property`, `match`, `oneOf`, and the `ok`, `true`, `false`, `null`, `undefined`, and `empty` properties, with `.not`. Type checks with `a()` and `an()` aren't available. |
| `assert` | Full Chai `assert` | `ok`, `fail`, `equal`, `notEqual`, `strictEqual`, `notStrictEqual`, `deepEqual`, `notDeepEqual`, `isTrue`, `isFalse`, `isNull`, `isNotNull`, `isUndefined`, `isDefined`, `isArray`, `isString`, `isNumber`, `isObject`, `isBoolean`, `isAbove`, `isBelow`, `isAtLeast`, `isAtMost`, `include`, `notInclude`, `lengthOf`, `match`, `property`, `typeOf` |
| Time limit | 5 seconds of synchronous work, 30 seconds in total | 30 seconds in total |
