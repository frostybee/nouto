---
title: Assertions & Scripts
description: Validate API responses automatically with GUI assertions, and run JavaScript before or after requests with pre/post-request scripts.
---

Nouto provides two complementary testing tools: GUI assertions for no-code response validation, and JavaScript scripts for dynamic logic, request manipulation, and programmatic tests.

## Assertions

Assertions define expected conditions on a response and evaluate them automatically after each request. Results appear inline in the request panel and in the response panel as a pass/fail list.

Open a request, click the **Tests** tab, and click **Add Test** to create an assertion.

### What You Can Assert

| Target | Example |
|--------|---------|
| Status Code | equals `200` |
| Response Time | less than `500` ms |
| JSON Path | `$.data.token` exists |
| JSON Path | `$.users` isType `array` |
| Header | `Content-Type` contains `application/json` |
| Response Body | contains `"success"` |
| Set Variable | extract `$.token` into `authToken` |

The **Set Variable** target is special: it extracts a value from the response and stores it in an environment variable for use in subsequent requests. It does not produce a pass/fail result.

### Results

After sending a request, each assertion row shows a green checkmark or red cross. Failed assertions expand to show the actual value received. In the Collection Runner, assertion results appear per-request in the results table.

For the full list of targets, operators, and examples, see [Assertions](/testing/assertions).

## Scripts

Scripts let you run JavaScript before a request is sent and after the response is received.

Open a request and click the **Scripts** tab. Two buttons toggle between **Pre-request Script** and **Post-response Script**.

### Pre-request Script

Runs before the HTTP request is sent. Use it to compute dynamic headers, generate signatures, or set variables:

```javascript
// Add a timestamp header
nt.request.setHeader('X-Timestamp', String(Date.now()));

// Compute HMAC signature
const secret = nt.getVar('apiSecret');
const sig = nt.hash.sha256(nt.request.url + secret);
nt.request.setHeader('X-Signature', sig);
```

### Post-response Script

Runs after the response is received. Use it to validate the response, extract values for later requests, or run programmatic tests:

```javascript
// Extract a token
const token = nt.response.json().token;
nt.setVar('authToken', token);

// Run a programmatic test
nt.test('Status is 200', () => {
  if (nt.response.status !== 200) throw new Error('got ' + nt.response.status);
});
```

### Script Inheritance

Scripts can be defined at the collection, folder, and request levels. When a request runs, scripts execute in this order:

```
Collection pre-request → Folder pre-request → Request pre-request
  → HTTP request
→ Request post-response → Folder post-response → Collection post-response
```

This lets you define shared setup (authentication, logging) at the collection level while keeping request-specific logic at the request level.

For the complete `nt` API reference, see [Script API](/testing/script-api). For script execution output, console logging, and security restrictions, see [Scripts](/testing/scripts).
