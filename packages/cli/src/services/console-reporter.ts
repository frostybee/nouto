import chalk from 'chalk';
import type { CollectionRunRequestResult, CollectionRunResult } from '@nouto/core';

const METHOD_COLORS: Record<string, chalk.Chalk> = {
  GET: chalk.blue,
  POST: chalk.green,
  PUT: chalk.yellow,
  PATCH: chalk.cyan,
  DELETE: chalk.red,
  HEAD: chalk.magenta,
  OPTIONS: chalk.gray,
};

function colorMethod(method: string): string {
  const colorFn = METHOD_COLORS[method.toUpperCase()] || chalk.white;
  return colorFn(method.toUpperCase().padEnd(7));
}

function colorStatus(status: number): string {
  if (status >= 200 && status < 300) return chalk.green(String(status));
  if (status >= 300 && status < 400) return chalk.yellow(String(status));
  return chalk.red(String(status));
}

function formatDuration(ms: number): string {
  if (ms < 1000) return chalk.dim(`${ms}ms`);
  return chalk.dim(`${(ms / 1000).toFixed(1)}s`);
}

export class ConsoleReporter {
  private silent: boolean;
  private totalRequests = 0;
  private startTime = 0;
  private failures: { index: number; result: CollectionRunRequestResult }[] = [];

  constructor(options: { silent?: boolean } = {}) {
    this.silent = options.silent || false;
  }

  start(collectionName: string, requestCount: number, envName?: string): void {
    if (this.silent) return;
    this.totalRequests = requestCount;
    this.startTime = Date.now();

    console.log();
    console.log(`  Running ${chalk.bold(`"${collectionName}"`)} (${requestCount} requests)`);
    if (envName) {
      console.log(`  Environment: ${chalk.cyan(envName)}`);
    }
    console.log();
  }

  onProgress(_progress: { current: number; total: number; requestName: string }): void {
    // Progress is shown via onRequestComplete instead
  }

  onRequestComplete(result: CollectionRunRequestResult, index: number): void {
    if (this.silent) return;

    const total = this.totalRequests;
    const counter = chalk.dim(`[${String(index).padStart(String(total).length)}/${total}]`);
    const method = colorMethod(result.method || 'GET');
    const name = result.requestName || result.url || 'Unknown';
    const truncatedName = name.length > 40 ? name.substring(0, 37) + '...' : name;
    const paddedName = truncatedName.padEnd(40);

    if (result.error) {
      const passStr = chalk.red('FAIL');
      const duration = formatDuration(result.duration || 0);
      console.log(`  ${counter}  ${method} ${paddedName} ${chalk.red('ERR')}       ${duration}  ${passStr}`);
      console.log(`  ${' '.repeat(String(total).length * 2 + 5)}${chalk.red(`- ${result.error}`)}`);
      this.failures.push({ index, result });
    } else {
      const status = colorStatus(result.status || 0);
      const duration = formatDuration(result.duration || 0);
      const allPassed = result.passed !== false;
      const passStr = allPassed ? chalk.green('PASS') : chalk.red('FAIL');

      console.log(`  ${counter}  ${method} ${paddedName} ${status}       ${duration}  ${passStr}`);

      if (!allPassed) {
        this.failures.push({ index, result });
        // Show failed assertions
        const failedAssertions = (result.assertionResults || []).filter(a => !a.passed);
        for (const a of failedAssertions) {
          console.log(`  ${' '.repeat(String(total).length * 2 + 5)}${chalk.red(`- ${a.message}`)}`);
        }
        // Show failed script tests
        const failedTests = (result.scriptTestResults || []).filter(t => !t.passed);
        for (const t of failedTests) {
          console.log(`  ${' '.repeat(String(total).length * 2 + 5)}${chalk.red(`- [test] ${t.name}: ${t.error || 'failed'}`)}`);
        }
      }
    }
  }

  finish(result: CollectionRunResult): void {
    if (this.silent) return;

    const elapsed = Date.now() - this.startTime;
    const passRate = result.totalRequests > 0
      ? ((result.passedRequests / result.totalRequests) * 100).toFixed(1)
      : '0.0';

    console.log();
    console.log(chalk.dim('  ─────────────────────────────────'));
    console.log();
    console.log(`  Collection:  ${chalk.bold(result.collectionName || 'Unknown')}`);
    console.log(`  Duration:    ${(elapsed / 1000).toFixed(2)}s`);
    console.log();
    console.log(`  Total:       ${result.totalRequests}`);
    console.log(`  Passed:      ${chalk.green(String(result.passedRequests))}  (${passRate}%)`);
    if (result.failedRequests > 0) {
      console.log(`  Failed:      ${chalk.red(String(result.failedRequests))}`);
    }
    if (result.skippedRequests > 0) {
      console.log(`  Skipped:     ${chalk.yellow(String(result.skippedRequests))}`);
    }

    // Show failure details
    if (this.failures.length > 0) {
      console.log();
      console.log(chalk.red.bold('  Failures:'));
      console.log();
      for (const { index, result: r } of this.failures) {
        console.log(chalk.red(`  ${index}. ${r.method || 'GET'} ${r.requestName || r.url || 'Unknown'}`));
        if (r.error) {
          console.log(`     Error: ${r.error}`);
        }
        const failedAssertions = (r.assertionResults || []).filter(a => !a.passed);
        for (const a of failedAssertions) {
          console.log(`     Assertion: ${a.message}`);
          if (a.expected !== undefined) console.log(`       Expected: ${a.expected}`);
          if (a.actual !== undefined) console.log(`       Actual:   ${a.actual}`);
        }
        const failedTests = (r.scriptTestResults || []).filter(t => !t.passed);
        for (const t of failedTests) {
          console.log(`     Test: ${t.name}`);
          if (t.error) console.log(`       ${t.error}`);
        }
      }
    }

    console.log();
  }
}
