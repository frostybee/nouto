// Runner result export service - generates JSON, CSV, JUnit XML, and HTML reports
// from collection runner results. Platform-independent, used by VS Code, Desktop, and future CLI.

import type { CollectionRunRequestResult, AssertionResult, ScriptTestResult } from '../types';

export type RunnerExportFormat = 'json' | 'csv' | 'junit' | 'html';

export interface RunnerExportInput {
  collectionName: string;
  results: CollectionRunRequestResult[];
  summary: {
    totalRequests?: number;
    passed: number;
    failed: number;
    skipped: number;
    totalDuration: number;
  };
  startedAt?: string;
  completedAt?: string;
}

// --- XML / HTML / CSV escaping helpers ---

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeCsvField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, '_');
}

function msToSeconds(ms: number): string {
  return (ms / 1000).toFixed(3);
}

// --- Service ---

export class RunnerExportService {

  /** Route to the appropriate formatter. */
  format(fmt: RunnerExportFormat, data: RunnerExportInput): string {
    switch (fmt) {
      case 'json': return this.formatJson(data);
      case 'csv': return this.formatCsv(data);
      case 'junit': return this.formatJunitXml(data);
      case 'html': return this.formatHtml(data);
      default: return this.formatJson(data);
    }
  }

  /** Get the recommended file extension for a format. */
  getFileExtension(fmt: RunnerExportFormat): string {
    switch (fmt) {
      case 'json': return 'json';
      case 'csv': return 'csv';
      case 'junit': return 'xml';
      case 'html': return 'html';
      default: return 'json';
    }
  }

  /** Get the default file name for a given format and collection name. */
  getDefaultFileName(fmt: RunnerExportFormat, collectionName: string): string {
    const safe = sanitizeFileName(collectionName || 'results');
    const ext = this.getFileExtension(fmt);
    const suffix = fmt === 'html' ? 'report' : 'results';
    return `${safe}_${suffix}.${ext}`;
  }

  /** Get file dialog filter label and extensions. */
  getFileFilter(fmt: RunnerExportFormat): { name: string; extensions: string[] } {
    switch (fmt) {
      case 'json': return { name: 'JSON Files', extensions: ['json'] };
      case 'csv': return { name: 'CSV Files', extensions: ['csv'] };
      case 'junit': return { name: 'XML Files', extensions: ['xml'] };
      case 'html': return { name: 'HTML Files', extensions: ['html'] };
      default: return { name: 'All Files', extensions: ['*'] };
    }
  }

  // =====================
  // JSON
  // =====================

  formatJson(data: RunnerExportInput): string {
    return JSON.stringify({
      collectionName: data.collectionName,
      summary: data.summary,
      results: data.results,
    }, null, 2);
  }

  // =====================
  // CSV
  // =====================

  formatCsv(data: RunnerExportInput): string {
    const header = '#,Name,Method,URL,Status,StatusText,Duration(ms),Pass/Fail,Error';
    const rows = data.results.map((r, i) => {
      return [
        String(i + 1),
        escapeCsvField(r.requestName || ''),
        r.method,
        escapeCsvField(r.url || ''),
        String(r.status),
        r.statusText || '',
        String(r.duration),
        r.passed ? 'Pass' : 'Fail',
        escapeCsvField(r.error || ''),
      ].join(',');
    });
    return [header, ...rows].join('\n');
  }

  // =====================
  // JUnit XML
  // =====================

  formatJunitXml(data: RunnerExportInput): string {
    const { collectionName, results, summary } = data;
    const totalTests = results.length;
    const timestamp = data.startedAt || new Date().toISOString();
    const totalTime = msToSeconds(summary.totalDuration);

    // Count failures and errors separately
    let failures = 0;
    let errors = 0;
    for (const r of results) {
      if (r.error) {
        errors++;
      } else if (!r.passed) {
        failures++;
      }
    }

    const lines: string[] = [];
    lines.push('<?xml version="1.0" encoding="UTF-8"?>');
    lines.push(`<testsuites name="${escapeXml(collectionName)}" tests="${totalTests}" failures="${failures}" errors="${errors}" time="${totalTime}">`);
    lines.push(`  <testsuite name="${escapeXml(collectionName)}" tests="${totalTests}" failures="${failures}" errors="${errors}" time="${totalTime}" timestamp="${escapeXml(timestamp)}">`);

    for (const r of results) {
      const testName = r.iterationIndex !== undefined
        ? `${r.requestName} [Iteration ${r.iterationIndex + 1}]`
        : r.requestName;
      const time = msToSeconds(r.duration);

      if (r.error) {
        // Transport/connection error
        lines.push(`    <testcase name="${escapeXml(testName)}" classname="${escapeXml(collectionName)}" time="${time}">`);
        lines.push(`      <error message="${escapeXml(r.error)}" type="RequestError">${escapeXml(r.error)}</error>`);
        lines.push('    </testcase>');
      } else if (!r.passed) {
        // Assertion or script test failure
        const failureDetails = this.buildFailureDetails(r);
        const firstMessage = failureDetails.firstMessage || 'Test failed';
        lines.push(`    <testcase name="${escapeXml(testName)}" classname="${escapeXml(collectionName)}" time="${time}">`);
        lines.push(`      <failure message="${escapeXml(firstMessage)}" type="AssertionFailure">${escapeXml(failureDetails.body)}</failure>`);
        lines.push('    </testcase>');
      } else {
        // Passed
        lines.push(`    <testcase name="${escapeXml(testName)}" classname="${escapeXml(collectionName)}" time="${time}" />`);
      }
    }

    lines.push('  </testsuite>');
    lines.push('</testsuites>');
    return lines.join('\n');
  }

  private buildFailureDetails(r: CollectionRunRequestResult): { firstMessage: string; body: string } {
    const parts: string[] = [];
    let firstMessage = '';

    // Failed assertions
    if (r.assertionResults) {
      for (const a of r.assertionResults) {
        if (!a.passed) {
          if (!firstMessage) firstMessage = a.message;
          parts.push(`Assertion: ${a.message}`);
          if (a.expected !== undefined) parts.push(`  Expected: ${a.expected}`);
          if (a.actual !== undefined) parts.push(`  Actual: ${a.actual}`);
        }
      }
    }

    // Failed script tests
    if (r.scriptTestResults) {
      for (const t of r.scriptTestResults) {
        if (!t.passed) {
          const msg = t.error ? `Script test "${t.name}": ${t.error}` : `Script test "${t.name}" failed`;
          if (!firstMessage) firstMessage = msg;
          parts.push(msg);
        }
      }
    }

    return { firstMessage, body: parts.join('\n') };
  }

  // =====================
  // HTML
  // =====================

  formatHtml(data: RunnerExportInput): string {
    const { collectionName, results, summary } = data;
    const timestamp = data.startedAt || new Date().toISOString();
    const totalTests = summary.totalRequests ?? results.length;

    const rows = results.map((r, i) => this.buildHtmlResultRow(r, i)).join('\n');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(collectionName)} - Test Report</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #1e1e1e; color: #cccccc; padding: 24px; }
    h1 { color: #ffffff; font-size: 1.5rem; margin-bottom: 4px; }
    .meta { color: #888888; font-size: 0.85rem; margin-bottom: 20px; }
    .summary { display: flex; gap: 12px; margin-bottom: 24px; flex-wrap: wrap; }
    .stat { padding: 12px 20px; border-radius: 6px; background: #2d2d2d; min-width: 100px; text-align: center; }
    .stat-value { font-size: 1.5rem; font-weight: 700; }
    .stat-label { font-size: 0.75rem; color: #888888; margin-top: 2px; }
    .stat-total .stat-value { color: #61affe; }
    .stat-passed .stat-value { color: #49cc90; }
    .stat-failed .stat-value { color: #f93e3e; }
    .stat-skipped .stat-value { color: #888888; }
    table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
    th { background: #2d2d2d; color: #888888; text-align: left; padding: 8px 12px; font-weight: 600; text-transform: uppercase; font-size: 0.75rem; letter-spacing: 0.5px; }
    td { padding: 8px 12px; border-bottom: 1px solid #333333; }
    tr.pass { background: rgba(73, 204, 144, 0.05); }
    tr.fail { background: rgba(249, 62, 62, 0.08); }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 3px; font-size: 0.75rem; font-weight: 600; }
    .badge-pass { background: rgba(73, 204, 144, 0.15); color: #49cc90; }
    .badge-fail { background: rgba(249, 62, 62, 0.15); color: #f93e3e; }
    .method { font-weight: 600; font-family: monospace; }
    .method-get { color: #61affe; }
    .method-post { color: #49cc90; }
    .method-put { color: #fca130; }
    .method-patch { color: #50e3c2; }
    .method-delete { color: #f93e3e; }
    .url { font-family: monospace; color: #aaaaaa; word-break: break-all; }
    .duration { font-family: monospace; }
    details { margin: 4px 0 8px 0; }
    summary { cursor: pointer; color: #61affe; font-size: 0.8rem; padding: 4px 0; }
    summary:hover { text-decoration: underline; }
    .detail-content { background: #252525; border-radius: 4px; padding: 10px 14px; margin-top: 4px; font-size: 0.8rem; font-family: monospace; white-space: pre-wrap; line-height: 1.5; }
    .detail-fail { color: #f93e3e; }
    .detail-pass { color: #49cc90; }
    .detail-error { color: #fca130; }
    .footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #333333; color: #666666; font-size: 0.75rem; text-align: center; }
  </style>
</head>
<body>
  <h1>${escapeHtml(collectionName)}</h1>
  <div class="meta">${escapeHtml(timestamp)} | Duration: ${summary.totalDuration}ms</div>

  <div class="summary">
    <div class="stat stat-total"><div class="stat-value">${totalTests}</div><div class="stat-label">Total</div></div>
    <div class="stat stat-passed"><div class="stat-value">${summary.passed}</div><div class="stat-label">Passed</div></div>
    <div class="stat stat-failed"><div class="stat-value">${summary.failed}</div><div class="stat-label">Failed</div></div>
    <div class="stat stat-skipped"><div class="stat-value">${summary.skipped}</div><div class="stat-label">Skipped</div></div>
  </div>

  <table>
    <thead>
      <tr><th>#</th><th>Name</th><th>Method</th><th>URL</th><th>Status</th><th>Duration</th><th>Result</th></tr>
    </thead>
    <tbody>
${rows}
    </tbody>
  </table>

  <div class="footer">Generated by Nouto | ${escapeHtml(new Date().toISOString())}</div>
</body>
</html>`;
  }

  private buildHtmlResultRow(r: CollectionRunRequestResult, index: number): string {
    const rowClass = r.passed ? 'pass' : 'fail';
    const badge = r.passed
      ? '<span class="badge badge-pass">PASS</span>'
      : '<span class="badge badge-fail">FAIL</span>';
    const methodClass = `method-${r.method.toLowerCase()}`;
    const name = r.iterationIndex !== undefined
      ? `${escapeHtml(r.requestName)} <span style="color:#888">[${r.iterationIndex + 1}]</span>`
      : escapeHtml(r.requestName);

    let detailsHtml = '';
    const hasDetails = r.error || (r.assertionResults && r.assertionResults.length > 0) || (r.scriptTestResults && r.scriptTestResults.length > 0);

    if (hasDetails) {
      const parts: string[] = [];

      if (r.error) {
        parts.push(`<span class="detail-error">Error: ${escapeHtml(r.error)}</span>`);
      }

      if (r.assertionResults) {
        for (const a of r.assertionResults) {
          const cls = a.passed ? 'detail-pass' : 'detail-fail';
          const icon = a.passed ? 'PASS' : 'FAIL';
          let line = `<span class="${cls}">[${icon}] ${escapeHtml(a.message)}</span>`;
          if (!a.passed && a.expected !== undefined) {
            line += `\n       Expected: ${escapeHtml(String(a.expected))}`;
          }
          if (!a.passed && a.actual !== undefined) {
            line += `\n       Actual:   ${escapeHtml(String(a.actual))}`;
          }
          parts.push(line);
        }
      }

      if (r.scriptTestResults) {
        for (const t of r.scriptTestResults) {
          const cls = t.passed ? 'detail-pass' : 'detail-fail';
          const icon = t.passed ? 'PASS' : 'FAIL';
          let line = `<span class="${cls}">[${icon}] ${escapeHtml(t.name)}</span>`;
          if (t.error) {
            line += `\n       ${escapeHtml(t.error)}`;
          }
          parts.push(line);
        }
      }

      detailsHtml = `
      <details>
        <summary>Details (${(r.assertionResults?.length || 0) + (r.scriptTestResults?.length || 0)} checks)</summary>
        <div class="detail-content">${parts.join('\n')}</div>
      </details>`;
    }

    return `      <tr class="${rowClass}">
        <td>${index + 1}</td>
        <td>${name}${detailsHtml}</td>
        <td><span class="method ${methodClass}">${r.method}</span></td>
        <td class="url">${escapeHtml(r.url || '')}</td>
        <td>${r.status}</td>
        <td class="duration">${r.duration}ms</td>
        <td>${badge}</td>
      </tr>`;
  }
}
