---
title: Scripts
description: Run JavaScript in Nouto before a request is sent and after its response arrives, to set headers, store values for later requests, and test responses.
sidebar:
  order: 1
---

A pre-request script runs before Nouto sends a request. A post-response script runs after the response arrives. Use scripts to compute headers, store values from a response for later requests, test responses in code, and choose the next request in a collection run. For checks that don't need code, use [assertions](/testing/assertions).

Scripts use the global `nt` object. The [Script API reference](/testing/script-api) documents every member.

## Add a script to a request

1. Open a request and select the **Scripts** tab.
2. Select **Pre-request Script** or **Post-response Script**.
3. Type the script. To start from an example, click a snippet button above the editor. The snippet goes in at the cursor.
4. Send the request.

The editor suggests `nt` members as you type. The tab label changes to `Scripts *` when the request has a script.

The snippet buttons depend on the selected script:

| Script | Snippets |
|--------|----------|
| Pre-request | Set Header, Get Variable, Set Variable, Log, UUID, Base64 Encode, Timestamp, Random Int |
| Post-response | Test Status, Test Body, Set Variable, Log Response, Hash, Set Next Request, Get Header |

## Pre-request scripts

A pre-request script can change the outgoing request through `nt.request`. Changes to the URL, method, and headers apply to the request that Nouto sends. `nt.response` is `undefined` here.

This script signs the request with an HMAC-style signature and adds a request ID:

```js
const secret = nt.getVar('apiSecret');
const timestamp = String(nt.timestamp.unix());
const signature = nt.hash.sha256(nt.request.method + nt.request.url + timestamp + secret);

nt.request.setHeader('X-Timestamp', timestamp);
nt.request.setHeader('X-Signature', signature);
nt.request.setHeader('X-Request-ID', nt.uuid());
```

## Post-response scripts

A post-response script reads the response through `nt.response`. Use it to store values for later requests and to test the response.

This script saves a token and runs two tests:

```js
const body = nt.response.json();
if (body.token) {
  nt.setVar('authToken', body.token);
}

nt.test('Status is 200', () => {
  expect(nt.response.status).to.equal(200);
});

nt.test('Response has a users array', () => {
  expect(Array.isArray(body.users)).to.equal(true);
});

console.log('Duration: ' + nt.response.duration + ' ms');
```

`nt.setVar()` saves to the active environment. If no environment is active, Nouto discards the value. To save a global variable instead, pass `'global'` as the third argument.

## Script output

After you send the request, the response panel shows a **Scripts** tab with a section for each script that ran: **Pre-request Script** and **Post-response Script**. Each section shows:

- An **OK** or **Error** badge, and the time the script took
- The error message, if the script threw
- Console output, labeled with the level: `log`, `info`, `warn`, or `error`
- For the post-response script, the `nt.test()` results, headed `Tests: 2/3 passed`

In the Collection Runner, click a request's row to see its **Script Tests** and **Script Logs**.

## Script inheritance

Collections and folders can have scripts too. To edit them, right-click the collection or folder in the sidebar, select **Settings...**, and open the **Scripts** tab. These scripts run for every request inside the collection or folder.

When a request in a collection runs, Nouto runs the scripts from the outermost level inward, in both phases:

1. The collection's pre-request script
2. Each folder's pre-request script, starting with the outermost folder
3. The request's pre-request script
4. Nouto sends the request.
5. The collection's post-response script
6. Each folder's post-response script, starting with the outermost folder
7. The request's post-response script

A variable set by one script in the chain is available to the scripts after it.

To run only a request's own scripts, open the request's **Scripts** tab and select **Own Only** under **Script Inheritance**. The default, **Inherit**, runs the whole chain. The **Script Inheritance** setting appears only for requests saved in a collection.

## Errors

If a script throws an error, Nouto stops it and skips the remaining scripts in the same phase. The **Scripts** tab shows the error. When a pre-request script fails, Nouto still sends the request.

## Asynchronous code

The VS Code extension and the CLI run each script inside an `async` function, so you can use `await` at the top level. `nt.delay()` and the `nt.cookies` methods return promises there:

```js
await nt.delay(500);
const cookies = await nt.cookies.getAll();
console.log('Cookies in the active jar: ' + cookies.length);
```

The desktop app doesn't support `await`. A top-level `await` is a syntax error. Every `nt` member returns its result directly, and `nt.delay()` blocks:

```js
nt.delay(500);
const cookies = nt.cookies.getAll();
console.log('Cookies in the active jar: ' + cookies.length);
```

`nt.sendRequest()` is available only in the desktop app. See [Platform differences](/testing/script-api/#platform-differences) for every behavior that differs between the two.

## Sandbox

Scripts run in a sandbox without module loading, file system access, or timers. In VS Code and the CLI, the synchronous part of a script can run for 5 seconds and the whole script for 30 seconds. In the desktop app, a script can run for 30 seconds. See [Sandbox and limits](/testing/script-api/#sandbox-and-limits).
