---
title: Collection runner
description: Run the requests in a Nouto collection or folder in order, repeat the run for each row of a CSV or JSON data file, and export the results as JSON, CSV, JUnit XML, or HTML.
sidebar:
  order: 3
---

The Collection Runner sends the requests in a collection or folder one after another and reports which ones passed and which failed. Use it for smoke tests and regression checks against an environment. To run a collection from a terminal or a CI pipeline, use the [CLI](/cli/run).

## Open the runner

Right-click a collection or folder in the sidebar and select **Run All**. The Collection Runner opens with every request in the collection or folder listed, including requests in subfolders.

## Set up a run

Before you start, choose which requests to run and how:

- To skip a request, clear its checkbox. **Select All** and **Deselect All** toggle every request.
- To change the order, drag a request by its handle.
- To use an environment other than the active one, pick it from the environment dropdown at the top. **No Environment** runs without one.

These options control the run:

| Option | Effect | Default |
|--------|--------|---------|
| **Stop on first failure** | Stops the whole run, including any remaining iterations, at the first request that fails | Off |
| **Delay between requests** | Milliseconds to wait between requests | `0` |
| **Request timeout (0 = default 30s)** | Timeout in milliseconds for requests that don't set their own timeout. `0` uses 30 seconds. | `0` |
| **Data Source (CSV/JSON)** | A data file that repeats the run once per row. See [Data-driven testing](#data-driven-testing). | None |

Click **Run N Requests** to start. While the run is in progress, a progress bar shows the current request's name and the count of requests done. Click **Cancel** to stop the run.

## Pass and fail rules

The runner marks a request as failed when any of these is true:

- The request got no response, for example because of a connection error. The **Status** column shows **Error**.
- The request has no enabled assertions, and the status code is 400 or higher.
- An enabled assertion fails. When a request has assertions, the status code alone doesn't fail it.
- An `nt.test()` check in one of its scripts fails.

Assertions include the ones defined on the request's collection and folders.

The runner sends HTTP requests only. It marks gRPC, WebSocket, SSE, and GraphQL subscription requests as **Skipped**. Skipped requests don't count as passed or failed, and they don't trigger **Stop on first failure**.

:::caution
The desktop app's runner doesn't evaluate assertions. There, a request fails only when it gets no response, when a script throws an error, or when an `nt.test()` check fails.
:::

## Results

When requests finish, the runner shows a summary of passed, failed, and skipped requests and the total time. Use **All**, **Passed**, and **Failed** to filter the results table.

The results table has these columns:

| Column | Contents |
|--------|----------|
| **#** | Position in the run |
| **Iter** | Iteration number. Shown only in data-driven runs. |
| **Name** | Request name |
| **Method** | HTTP method |
| **Status** | Status code and text, **Skipped**, or **Error** |
| **Duration** | Response time |
| **Result** | **Pass**, **Fail**, or **Skipped**, followed by the passed and total assertion count |

An error message appears below a request's row. Click a row to see its URL, **Script Tests**, **Script Logs**, **Assertions**, and the first 500 characters of the response body.

After the run, these buttons appear:

- **Retry Failed (N)** runs only the requests that failed.
- **Run Again** returns to the setup screen.
- **Export JSON**, **Export CSV**, **Export JUnit XML**, and **Export HTML** save the results. See [Export results](#export-results).

## Data-driven testing

A data file runs the selected requests once per row, with different values each time. Each column of a CSV file, or each key of a JSON object, becomes a variable that requests reference as `{{name}}`.

1. Under **Data Source (CSV/JSON)**, click **Select Data File** and pick a `.csv` or `.json` file. The runner shows the file name and its number of rows and columns.
2. To use only the first rows, set **Limit rows (0 = all)**.
3. Click **Run N Requests (M iterations)**.

Give columns names that don't clash with your environment variables. To clear the data file, click the **Clear data file** button next to its name.

### CSV files

The first row holds the column names. Nouto skips empty lines.

```csv title="users.csv"
username,password,expectedStatus
admin,secret123,200
user1,pass456,200
baduser,wrongpass,401
```

### JSON files

Use an array of objects. Nouto converts values that aren't strings to strings, and `null` to an empty string. A single object counts as one row.

```json title="users.json"
[
  { "userId": "1", "expectedName": "Alice" },
  { "userId": "2", "expectedName": "Bob" }
]
```

In a script, `nt.info.currentIteration` holds the zero-based row index.

## Flow control

A script can change which request runs next with `nt.setNextRequest()`. Pass the name or ID of a request in the run:

```js
// Post-response: jump to the cleanup request when login fails
if (nt.response.status !== 200) {
  nt.setNextRequest('Cleanup Request');
}
```

If no request matches, the runner continues with the next request in order. Requests that a jump passes over count as skipped in the summary. When jumps make a request repeat, the runner stops the run to break the loop. In VS Code and the CLI, that happens when one request would run a third time in the same iteration.

## Variables in a run

Before it sends each request, the runner resolves its `{{variable}}` references with the environment selected for the run. See [Variable substitution](/variables/variable-substitution).

Values that scripts set with `nt.setVar()`, and values that **Set Variable** assertions save, are available to the requests that run after them. In VS Code and the CLI, a request can also read an earlier response from the same run by name, for example `{{Login.$response.body.token}}`.

## Authentication

The runner applies the request's own Basic, Bearer Token, API Key, and OAuth 2.0 settings. For OAuth 2.0, it uses the token already stored for the request. In VS Code and the CLI, the runner refreshes an expired token when a refresh token is available. The runner never starts a new authorization flow, so get a token in the request editor before the run.

## Export results

After a run, export the results with one of the export buttons:

| Format | Contents |
|--------|----------|
| JSON | The collection name, the summary, and every result, including assertion results, script test results, and response data |
| CSV | One row per request with the columns `#`, `Name`, `Method`, `URL`, `Status`, `StatusText`, `Duration(ms)`, `Pass/Fail`, and `Error` |
| JUnit XML | One `<testcase>` per request, for CI systems that read JUnit reports |
| HTML | A standalone report with a summary, a results table, and failure details |

In JUnit XML, a request that got an error becomes an `<error>` element, and a request that failed an assertion or an `nt.test()` check becomes a `<failure>` element. In data-driven runs, each test case name ends with the iteration, for example `Get user [Iteration 2]`.

## Run history

The runner saves every finished run. To see past runs of the collection, click the history button in the runner header. The list shows each run's date, passed and failed counts, and duration. Click a run to see its results, or delete it with its trash button. **Clear All** deletes the collection's run history.

In VS Code, Nouto keeps up to 100 runs and deletes runs older than 30 days.
