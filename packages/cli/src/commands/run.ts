import type { Command } from 'commander';
import * as fs from 'fs/promises';
import * as path from 'path';
import { CollectionLoader } from '../services/collection-loader';
import { ConsoleReporter } from '../services/console-reporter';
import {
  CollectionRunnerService,
  RunnerExportService,
  resolveVariablesForRequest,
  getItemPath,
} from '@nouto/core/services';
import type { RunnerExportFormat } from '@nouto/core/services';
import type { CollectionRunConfig, EnvironmentsData, CollectionRunRequestResult } from '@nouto/core';

interface RunOptions {
  env?: string;
  envName?: string;
  folder?: string;
  data?: string;
  iterations?: string;
  delay?: string;
  timeout?: string;
  stopOnFailure?: boolean;
  reporter: string;
  output?: string;
  silent?: boolean;
}

export function registerRunCommand(program: Command): void {
  program
    .command('run')
    .description('Run a collection of API requests')
    .argument('<collection-file>', 'Path to collection JSON file')
    .option('-e, --env <file>', 'Environment file (Nouto JSON)')
    .option('-n, --env-name <name>', 'Environment name to activate')
    .option('--folder <name-or-id>', 'Run only a specific folder within the collection')
    .option('-d, --data <file>', 'Data file for data-driven testing (CSV/JSON)')
    .option('-i, --iterations <n>', 'Number of iterations (default: 1)')
    .option('--delay <ms>', 'Delay between requests in milliseconds (default: 0)')
    .option('--timeout <ms>', 'Per-request timeout in milliseconds (default: 30000)')
    .option('--stop-on-failure', 'Stop execution on first failure')
    .option('-r, --reporter <type>', 'Reporter: cli, json, junit, html', 'cli')
    .option('-o, --output <file>', 'Output file for reporter (stdout if omitted)')
    .option('--silent', 'Suppress progress output')
    .action(async (collectionFile: string, options: RunOptions) => {
      try {
        await executeRun(collectionFile, options);
      } catch (err: any) {
        console.error(`\n  Error: ${err.message}\n`);
        process.exit(1);
      }
    });
}

async function executeRun(collectionFile: string, options: RunOptions): Promise<void> {
  // 1. Load collection
  const collection = await CollectionLoader.loadCollection(collectionFile);

  // 2. Load environments (optional)
  let envData: EnvironmentsData = {
    environments: [],
    activeId: null,
    globalVariables: [],
  };

  if (options.env) {
    envData = await CollectionLoader.loadEnvironments(options.env);
  }

  // Activate environment by name if specified
  let envName: string | undefined;
  if (options.envName) {
    const env = envData.environments.find(
      e => e.name.toLowerCase() === options.envName!.toLowerCase(),
    );
    if (!env) {
      const available = envData.environments.map(e => e.name).join(', ');
      throw new Error(
        `Environment "${options.envName}" not found. Available: ${available || 'none'}`,
      );
    }
    envData.activeId = env.id;
    envName = env.name;
  } else if (envData.activeId) {
    const activeEnv = envData.environments.find(e => e.id === envData.activeId);
    envName = activeEnv?.name;
  }

  // 3. Get requests (from folder or entire collection)
  const requests = CollectionLoader.getRequests(collection, options.folder);
  if (requests.length === 0) {
    throw new Error('No requests found in the collection');
  }

  // 4. Load data file (optional)
  let dataRows = undefined;
  if (options.data) {
    dataRows = await CollectionLoader.loadDataFile(options.data);
    if (dataRows.length === 0) {
      throw new Error('Data file is empty');
    }
  }

  // 5. Resolve collection-scoped variables
  const collectionVariables = collection.variables || [];

  // 6. Build config
  const config: CollectionRunConfig = {
    collectionId: collection.id,
    stopOnFailure: options.stopOnFailure || false,
    delayMs: options.delay ? parseInt(options.delay, 10) : 0,
    timeoutMs: options.timeout ? parseInt(options.timeout, 10) : 30000,
    iterations: options.iterations ? parseInt(options.iterations, 10) : 1,
  };

  // 7. Set up reporter
  const reporterType = options.reporter as RunnerExportFormat | 'cli';
  const reporter = new ConsoleReporter({ silent: options.silent || reporterType !== 'cli' });
  reporter.start(collection.name, requests.length, envName);

  // 8. Run collection
  const runner = new CollectionRunnerService();
  let requestIndex = 0;

  const result = await runner.runCollection(
    requests,
    config,
    collection.name,
    envData,
    (progress) => reporter.onProgress(progress),
    (requestResult: CollectionRunRequestResult) => {
      requestIndex++;
      reporter.onRequestComplete(requestResult, requestIndex);
    },
    collection,
    collectionVariables,
    dataRows,
  );

  // 9. Show summary (for CLI reporter)
  reporter.finish(result);

  // 10. Generate report output (for non-CLI reporters)
  if (reporterType !== 'cli') {
    const exporter = new RunnerExportService();
    const reportContent = exporter.format(reporterType, {
      collectionName: result.collectionName,
      results: result.results,
      summary: {
        totalRequests: result.totalRequests,
        passed: result.passedRequests,
        failed: result.failedRequests,
        skipped: result.skippedRequests,
        totalDuration: result.totalDuration,
      },
      startedAt: result.startedAt,
      completedAt: result.completedAt,
    });

    if (options.output) {
      const outputPath = path.resolve(options.output);
      await fs.writeFile(outputPath, reportContent, 'utf-8');
      if (!options.silent) {
        console.log(`  Report written to: ${outputPath}\n`);
      }
    } else {
      process.stdout.write(reportContent);
    }
  }

  // 11. Exit code
  process.exit(result.failedRequests > 0 ? 1 : 0);
}
