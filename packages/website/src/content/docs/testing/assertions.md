---
title: Assertions
description: Check status codes, headers, body values, and JSON Schema in Nouto responses without writing code, and save response values to variables.
sidebar:
  order: 0
---

An assertion is a check that Nouto runs against the response every time you send a request. Each assertion compares one part of the response, such as the status code or a JSONPath value, with an expected value. Results appear in the request editor, the response panel, and the Collection Runner. For checks that need code, use [scripts](/testing/scripts).

## Add an assertion

1. Open a request and select the **Tests** tab. For a gRPC request, select the **Assertions** tab.
2. Click **Add Test**. Nouto adds a row that checks **Status Code** `=` `200`. For a gRPC request, the new row checks **Status Code** `=` `0`.
3. Choose the target, operator, and expected value.
4. Send the request.

The tab label shows the number of assertions, for example `Tests (3)`.

Each row has these fields:

| Field | Description |
|-------|-------------|
| Checkbox | Turns the assertion on or off without deleting it |
| Target | The part of the response to check |
| Property | A JSONPath expression, header name, or similar input. Shown only for targets that need one. |
| Operator | How to compare the value with the expected value. Hidden for **JSON Schema** and **Set Variable**. |
| Expected | The value to compare against. Hidden for operators that don't use one. |

To delete a row, click its **Remove assertion** button.

## Targets

| Target | Property | Value checked |
|--------|----------|---------------|
| **Status Code** | None | HTTP status code |
| **Response Time** | None | Response time in milliseconds |
| **Response Size** | None | Response body size in bytes |
| **Response Body** | None | The whole body as text |
| **JSON Path** | JSONPath expression, for example `$.data[0].name` | The matched value. When the path matches more than one value, Nouto compares them as a JSON array. |
| **Header** | Header name, case-insensitive | The value of that response header |
| **Content-Type** | None | The value of the `Content-Type` header |
| **JSON Schema** | None | Validates the JSON body against a schema that you paste into the text area below the row |
| **Set Variable** | JSONPath expression | Saves a value to a variable. See [Save a response value](#save-a-response-value). |

### gRPC targets

For gRPC requests, the **Header** target is labeled **Header / Initial Metadata**, and four more targets are available:

| Target | Property | Value checked |
|--------|----------|---------------|
| **gRPC Status Name** | None | Status code name, for example `OK`, `NOT_FOUND`, or `UNAVAILABLE` |
| **gRPC Trailer** | Trailer name, case-insensitive | The value of that response trailer |
| **Stream Msg Count** | None | Number of messages received in a streaming call |
| **Stream Message** | `0` for the first message, or `0.$.field` for a field in it | One message by its zero-based index, or a JSONPath value inside it. A message that isn't JSON is compared as text. |

## Operators

The operator list shows these labels:

| Operator | Passes when |
|----------|-------------|
| `=` | The value equals the expected value. When both are numbers, Nouto compares them as numbers, so `200` equals `200.0`. Otherwise the text must match exactly. |
| `!=` | The value doesn't equal the expected value |
| `contains` | The value contains the expected text. Case-sensitive. |
| `!contains` | The value doesn't contain the expected text, or the value is missing |
| `>`, `<`, `>=`, `<=` | The numeric comparison holds. Fails when either side isn't a number. |
| `exists` | The target has a value. Takes no expected value. |
| `!exists` | The target has no value. Takes no expected value. |
| `isType` | The value's JSON type matches the expected type: `string`, `number`, `boolean`, `array`, `object`, or `null`. A string that looks like a number, such as `"42"`, counts as `number`. |
| `isJSON` | The value parses as JSON. Takes no expected value. |
| `count` | The array length, or the number of keys in an object, equals the expected number |
| `regex` | The value matches the expected JavaScript regular expression. Enter the pattern without slashes or flags. |
| `any[] =` | At least one array item equals the expected text |
| `any[] contains` | At least one array item contains the expected text |
| `any[] starts` | At least one array item starts with the expected text |
| `any[] ends` | At least one array item ends with the expected text |

The `any[]` operators treat a value that isn't an array as an array with one item.

## Save a response value

The **Set Variable** target copies a value from the JSON response into a variable, so later requests can use it.

1. Select **Set Variable** as the target.
2. In **Property**, enter the JSONPath of the value, for example `$.token`.
3. In **Variable name**, enter the variable to set, for example `authToken`.

When the response arrives, Nouto saves the first value that the path matches to the active environment. The row passes when Nouto finds a value. It fails, with `Could not extract value for variable`, when the path matches nothing.

:::caution
Select an active environment before you rely on **Set Variable**. Without one, Nouto discards the value.
:::

Later requests read the value as `{{authToken}}`, for example in an `Authorization: Bearer {{authToken}}` header. In the Collection Runner, the value is available to the requests that run after this one.

## Collection and folder assertions

To check every request in a collection or folder, right-click it in the sidebar, select **Settings...**, open the **Tests** tab, and click **Add Assertion**. Nouto runs these assertions together with each request's own assertions.

## Results

In the request editor, each row shows a pass or fail icon after the response arrives. A failed row shows the failure message and the actual value after `Got:`. The **Test Assertions** header shows a count such as `3/5 passed`.

The response panel adds a **Tests** tab, labeled with the count, for example `Tests 3/5`. It shows a summary such as `3/5 tests passed (2 failed)`, followed by each assertion's message and, for failures, the actual value.

In the [Collection Runner](/testing/collection-runner), the **Result** column shows the passed and total assertion count next to **Pass** or **Fail**. Click a row to see each assertion.

## Examples

These examples show one assertion per table row.

Check the status and response time:

| Target | Property | Operator | Expected |
|--------|----------|----------|----------|
| Status Code | | `=` | `200` |
| Response Time | | `<` | `500` |

Check that a JSON field exists and has the right type:

| Target | Property | Operator | Expected |
|--------|----------|----------|----------|
| JSON Path | `$.data` | `exists` | |
| JSON Path | `$.data.users` | `isType` | `array` |
| JSON Path | `$.data.total` | `>` | `0` |

Check a gRPC streaming call:

| Target | Property | Operator | Expected |
|--------|----------|----------|----------|
| gRPC Status Name | | `=` | `OK` |
| Stream Msg Count | | `>=` | `3` |
| Stream Message | `0.$.id` | `exists` | |

## Saving and exporting

Nouto saves assertions with the request in its collection. To keep them when you share a collection, export it as a Nouto collection. Postman exports don't include assertions.
