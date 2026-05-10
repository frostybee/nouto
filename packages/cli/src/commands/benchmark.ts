import type { Command } from 'commander';
import * as fs from 'fs/promises';
import * as path from 'path';
import chalk from 'chalk';
import { CollectionLoader, CliError } from '../services/collection-loader';
import { EXIT } from '../lib/exit-codes';
import { BenchmarkService, collectScopedVariables } from '@nouto/core/services';
import type { EnvironmentsData, BenchmarkConfig, SavedRequest } from '@nouto/core';
import { findRequestRecursive, getAllRequestsFromItems } from '@nouto/core/services';

interface BenchmarkOptions {
  env?: string;
  envName?: string;
  envVar?: string[];
  envFile?: string;
  request: string;
  iterations?: string;
  concurrency?: string;
  delay?: string;
  reporter: string;
  output?: string;
  insecure?: boolean;
  cacert?: string;
  proxy?: string;
  noproxy?: boolean;
  verbose?: boolean;
}

export function registerBenchmarkCommand(program: Command): void {
  program
    .command('benchmark')
    .description('Benchmark a single request with multiple iterations')
    .argument('<collection-file>', 'Path to collection JSON file')
    .requiredOption('--request <name-or-id>', 'Request name or ID within the collection')
    .option('-e, --env <file>', 'Environment file (Nouto JSON)')
    .option('-n, --env-name <name>', 'Environment name to activate')
    .option('--env-var <pairs...>', 'Override variables (KEY=VALUE, repeatable)')
    .option('--env-file <file>', 'Load variables from .env file (dotenv format)')
    .option('-i, --iterations <n>', 'Number of iterations', '100')
    .option('-c, --concurrency <n>', 'Concurrent requests', '1')
    .option('--delay <ms>', 'Delay between iterations in milliseconds', '0')
    .option('-r, --reporter <type>', 'Reporter: cli, json', 'cli')
    .option('-o, --output <file>', 'Output file')
    .option('--insecure', 'Disable SSL certificate verification')
    .option('--cacert <file>', 'Custom CA certificate file path')
    .option('--proxy <url>', 'HTTP/HTTPS/SOCKS5 proxy URL')
    .option('--noproxy', 'Disable all proxy settings')
    .option('--verbose', 'Show detailed request/response information')
    .action(async (collectionFile: string, options: BenchmarkOptions) => {
      try {
        await executeBenchmark(collectionFile, options);
      } catch (err: any) {
        const exitCode = err instanceof CliError ? err.exitCode : EXIT.OTHER_ERROR;
        console.error(`\n  Error: ${err.message}\n`);
        process.exit(exitCode);
      }
    });
}

function findRequestByNameOrId(collection: any, nameOrId: string): SavedRequest | null {
  // Try by ID first
  const byId = findRequestRecursive(collection.items, nameOrId);
  if (byId) return byId;

  // Try by name
  const allRequests = getAllRequestsFromItems(collection.items);
  return allRequests.find(r => r.name.toLowerCase() === nameOrId.toLowerCase()) || null;
}

async function executeBenchmark(collectionFile: string, options: BenchmarkOptions): Promise<void> {
  const collection = await CollectionLoader.loadCollection(collectionFile);

  let envData: EnvironmentsData = { environments: [], activeId: null, globalVariables: [] };
  if (options.env) {
    envData = await CollectionLoader.loadEnvironments(options.env);
  }

  if (options.envFile) {
    const envFileVars = await CollectionLoader.loadDotEnvFile(options.envFile);
    envData.globalVariables = [...envFileVars, ...(envData.globalVariables || [])];
  }

  if (options.envName) {
    const env = envData.environments.find(
      e => e.name.toLowerCase() === options.envName!.toLowerCase(),
    );
    if (!env) {
      const available = envData.environments.map(e => e.name).join(', ');
      throw new CliError(
        `Environment "${options.envName}" not found. Available: ${available || 'none'}`,
        EXIT.ENV_NOT_FOUND,
      );
    }
    envData.activeId = env.id;
  }

  if (options.envVar && options.envVar.length > 0) {
    const overrides = CollectionLoader.parseEnvVarOverrides(options.envVar);
    if (envData.activeId) {
      const activeEnv = envData.environments.find(e => e.id === envData.activeId);
      if (activeEnv) {
        activeEnv.variables = [...activeEnv.variables, ...overrides];
      }
    } else {
      envData.globalVariables = [...(envData.globalVariables || []), ...overrides];
    }
  }

  const request = findRequestByNameOrId(collection, options.request);
  if (!request) {
    throw new CliError(`Request "${options.request}" not found in collection`, EXIT.REQUEST_NOT_FOUND);
  }

  const colVars = collectScopedVariables(collection, request.id);

  const config: BenchmarkConfig = {
    iterations: parseInt(options.iterations || '100', 10),
    concurrency: parseInt(options.concurrency || '1', 10),
    delayBetweenMs: parseInt(options.delay || '0', 10),
  };

  console.log();
  console.log(`  Benchmarking ${chalk.bold(request.name)} (${request.method} ${request.url})`);
  console.log(`  Iterations: ${config.iterations}, Concurrency: ${config.concurrency}`);
  console.log();

  const service = new BenchmarkService();
  const result = await service.run(
    request,
    config,
    envData,
    (current, total) => {
      if (options.reporter === 'cli') {
        process.stdout.write(`\r  Progress: ${current}/${total}`);
      }
    },
    () => {},
    colVars,
  );

  if (options.reporter === 'cli') {
    process.stdout.write('\r' + ' '.repeat(40) + '\r');
    const s = result.statistics;
    console.log(chalk.dim('  ─────────────────────────────────'));
    console.log(`  Results:     ${chalk.green(String(s.successCount))} passed, ${s.failCount > 0 ? chalk.red(String(s.failCount)) : '0'} failed`);
    console.log(`  Total:       ${(s.totalDuration / 1000).toFixed(2)}s`);
    console.log(`  RPS:         ${s.requestsPerSecond.toFixed(1)} req/s`);
    console.log();
    console.log(`  Min:         ${s.min}ms`);
    console.log(`  Max:         ${s.max}ms`);
    console.log(`  Mean:        ${s.mean.toFixed(1)}ms`);
    console.log(`  Median:      ${s.median}ms`);
    console.log(`  p90:         ${s.p90}ms`);
    console.log(`  p95:         ${s.p95}ms`);
    console.log(`  p99:         ${s.p99}ms`);
    console.log();
  } else {
    const output = JSON.stringify(result, null, 2);
    if (options.output) {
      await fs.writeFile(path.resolve(options.output), output, 'utf-8');
      console.log(`  Report written to: ${options.output}\n`);
    } else {
      process.stdout.write(output);
    }
  }

  process.exit(result.statistics.failCount > 0 ? 1 : 0);
}
