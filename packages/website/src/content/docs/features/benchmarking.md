---
title: Benchmarking
description: Measure API endpoint performance with configurable iterations, concurrency, and percentile statistics.
---

The benchmark tool runs a single request repeatedly and reports latency statistics. Use it to measure baseline performance, detect regressions, or stress-test an endpoint with concurrent requests.

## Opening the Benchmark Tool

Right-click a saved request in the sidebar and select **Benchmark**, or open it from the Command Palette (**Benchmark Request**).

## Configuration

| Option | Description | Default |
|--------|-------------|---------|
| **Iterations** | Total number of requests to send | 100 |
| **Concurrency** | Number of requests sent in parallel | 1 |
| **Delay** | Milliseconds to wait between iterations | 0 |
| **Timeout** | Per-request timeout in milliseconds | 30000 |

**Concurrency 1** (sequential) measures baseline latency without contention. Higher concurrency simulates multiple simultaneous clients and reveals how the endpoint behaves under load.

## Running

Click **Run** to start. A progress bar shows completed iterations. Click **Cancel** to stop early. Partial results are displayed for cancelled runs.

## Results

After the run, the results panel shows:

| Metric | Description |
|--------|-------------|
| **Passed / Failed** | Counts of successful and failed requests |
| **Total time** | Wall-clock time for the full run |
| **RPS** | Requests per second (throughput) |
| **Min** | Fastest iteration |
| **Max** | Slowest iteration |
| **Mean** | Average duration |
| **Median (p50)** | Middle value |
| **p90 / p95 / p99** | Tail latency percentiles |

A distribution chart shows the spread of response times across all iterations.

## Exporting Results

Click **Export** to save results as JSON. The export includes all per-iteration data: status, duration, and error (if any), plus the full statistics summary.

## CLI

The benchmark tool is also available from the command line for CI integration. See [CLI: Benchmark](/cli/benchmark).
