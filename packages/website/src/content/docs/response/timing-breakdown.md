---
title: Timing Breakdown
description: Inspect per-phase HTTP timing in Nouto including DNS lookup, TCP handshake, TLS negotiation, TTFB, and content transfer.
sidebar:
  order: 3
---

The **Timing** tab in the response panel breaks down where the total response time was spent. Each phase is shown as a labeled bar with a millisecond value.

<!-- screenshot: response/timing-breakdown.png -->
![Timing panel showing DNS, TCP, TLS, TTFB, and Content Transfer bars with millisecond values and a total at the bottom](/screenshots/response/timing-breakdown.png)

## Opening the Timing Tab

Send a request and click the **Timing** tab in the response panel. The breakdown is available for every successful HTTP response.

## Timing Phases

| Phase | What it measures |
|-------|-----------------|
| **DNS** | Time to resolve the hostname to an IP address |
| **TCP** | Time to establish the TCP connection (three-way handshake) |
| **TLS** | Time for the TLS/SSL handshake (HTTPS only; zero for HTTP) |
| **TTFB** | Time to first byte: from request sent to first byte of response received |
| **Transfer** | Time to download the response body after the first byte |

The phases are sequential. The total response time shown in the status bar equals the sum of all phases.

## Interpreting Results

**High DNS**: The hostname is not cached. Subsequent requests to the same host will typically be faster. Seeing high DNS on repeated requests may indicate a short TTL on the server's DNS records.

**High TCP**: Network latency to the server is significant. Geographic distance or network routing are common causes.

**High TLS**: The TLS handshake is slow. This is usually a one-time cost per connection; subsequent requests over the same connection skip this phase.

**High TTFB**: The server took a long time to generate the response. This is server-side processing time: database queries, computation, queuing. It is independent of network conditions.

**High Transfer**: The response body is large, or the download bandwidth is limited. Check the response size in the status bar.

## Platform Notes

Timing data is collected by the HTTP client on each platform:

| Phase | VS Code extension | Desktop app (Rust) |
|-------|------------------|--------------------|
| DNS | Supported | Supported |
| TCP | Supported | Supported |
| TLS | Supported | Supported |
| TTFB | Supported | Supported |
| Transfer | Supported | Supported |

When a request goes through a proxy, the DNS and TCP phases reflect the time to connect to the proxy, not the origin server.
