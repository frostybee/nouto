---
title: Collection Runner
description: Run all requests in a collection or folder sequentially in Nouto, with data-driven iterations, assertion results, and CI/CD-compatible export.
---

The Collection Runner executes every request in a collection or folder sequentially, shows real-time progress, and produces a detailed results table. Use it to run regression tests, data-driven test suites, or smoke test sequences against an environment.

<!-- screenshot: testing/runner-panel.png -->
![Runner panel with a CSV data file loaded, the results table showing pass/fail rows for each request, and the export format dropdown open](/screenshots/testing/runner-panel.png)

## Opening the Runner

Right-click a collection or folder in the sidebar and select **Run All**. The runner opens in a dedicated panel.

## Configuration

Before starting, configure the run options:

| Option | Description | Default |
|--------|-------------|---------|
| **Data file** | CSV or JSON file for data-driven iterations | None |
| **Stop on first failure** | Halt execution when a request fails or returns status >= 400 | Off |
| **Delay between requests** | Milliseconds to wait between requests | 0 ms |
| **Per-request timeout** | Override the individual request timeout for all requests in the run | Request default |

## Running

Click **Run Collection** to start. A progress bar shows the current and total request count along with the name of the active request. Click **Cancel** to stop mid-run.

## Results Table

Each completed request appears as a row:

| Column | Description |
|--------|-------------|
| # | Sequential index (includes iteration number for data-driven runs) |
| Name | Request name |
| Method | HTTP method |
| Status | HTTP status code and text |
| Duration | Response time in ms |
| Assertions | Pass/fail badge (e.g., "3/4") |
| Result | Pass or Fail |

Failed requests show an expandable row with the error message or failed assertion details. Click any row to expand and see individual assertion and script test results.

After the run completes, a summary bar shows total passed, failed, and skipped counts along with the total execution time.

## Data-Driven Testing

Load a CSV or JSON data file to run the collection multiple times, once per row, with different variable values each iteration.

### CSV Files

The first row must be the header row. Each column name becomes a variable:

```csv
username,password,expectedStatus
admin,secret123,200
user1,pass456,200
baduser,wrongpass,401
```

### JSON Files

An array of objects. Each object's keys become variables:

```json
[
  { "userId": "1", "expectedName": "Alice" },
  { "userId": "2", "expectedName": "Bob" }
]
```

In your requests, reference the columns with `{{username}}`, `{{userId}}`, etc. The runner substitutes the values for each iteration.

## Flow Control

Use `nt.setNextRequest()` in a post-response script to skip ahead, jump to a specific request by name, or stop the run early:

```javascript
// Skip to a specific request
nt.setNextRequest('Cleanup Request');

// Stop the run after this request
nt.setNextRequest(null);
```

## Variable Substitution

The runner performs full variable substitution on each request:

- Environment variables (`{{variableName}}`)
- Global variables
- Dynamic variables (`{{$uuid.v4}}`, `{{$timestamp.iso}}`, etc.)
- Response chaining (`{{$response.body.token}}` uses the most recent response)
- Set Variable assertions and `nt.setVar()` calls update the active environment between requests

## Authentication

All auth types work in the runner. OAuth 2.0 uses whatever token is currently stored; the runner does not trigger new OAuth flows.

## Export Results

After a run completes, export the results in four formats:

| Format | Use for |
|--------|---------|
| **JSON** | Full structured data with per-request details, assertions, and script test results |
| **CSV** | Tabular summary: name, method, URL, status, duration, pass/fail |
| **JUnit XML** | CI/CD integration (Jenkins, GitHub Actions, GitLab CI, Azure DevOps) |
| **HTML Report** | Self-contained report file with a summary header and expandable request details |

The JUnit XML format maps each request to a `<testcase>`, with `<failure>` for assertion failures and `<error>` for transport errors (timeout, connection refused).

## Runner History

Nouto keeps a history of the last 100 runs for 30 days. Access it from the runner panel to review results from previous executions without re-running the collection.
