import type { Command } from 'commander';
import * as fs from 'fs/promises';
import * as path from 'path';
import { CollectionLoader, CliError } from '../services/collection-loader';
import { ConsoleReporter } from '../services/console-reporter';
import { CliCookieContext } from '../services/cookie-adapter';
import { redactReportResults } from '../services/redactor';
import { EXIT } from '../lib/exit-codes';
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
  envVar?: string[];
  envFile?: string;
  folder?: string;
  data?: string;
  iterations?: string;
  delay?: string;
  timeout?: string;
  stopOnFailure?: boolean;
  reporter: string;
  output?: string;
  silent?: boolean;
  insecure?: boolean;
  cacert?: string;
  clientCertConfig?: string;
  proxy?: string;
  noproxy?: boolean;
  verbose?: boolean;
  parallel?: boolean;
  disableCookies?: boolean;
  tags?: string;
  excludeTags?: string;
  reporterJson?: string;
  reporterJunit?: string;
  reporterHtml?: string;
  reporterSkipHeaders?: boolean;
  reporterSkipRequestBody?: boolean;
  reporterSkipResponseBody?: boolean;
  reporterSkipBody?: boolean;
}

export function registerRunCommand(program: Command): void {
  program
    .command('run')
    .description('Run a collection of API requests')
    .argument('<collection-file>', 'Path to collection JSON file')
    .option('-e, --env <file>', 'Environment file (Nouto JSON)')
    .option('-n, --env-name <name>', 'Environment name to activate')
    .option('--env-var <pairs...>', 'Override variables (KEY=VALUE, repeatable)')
    .option('--env-file <file>', 'Load variables from .env file (dotenv format)')
    .option('--folder <name-or-id>', 'Run only a specific folder within the collection')
    .option('-d, --data <file>', 'Data file for data-driven testing (CSV/JSON)')
    .option('-i, --iterations <n>', 'Number of iterations (default: 1)')
    .option('--delay <ms>', 'Delay between requests in milliseconds (default: 0)')
    .option('--timeout <ms>', 'Per-request timeout in milliseconds (default: 30000)')
    .option('--stop-on-failure', 'Stop execution on first failure')
    .option('--parallel', 'Run requests concurrently')
    .option('-r, --reporter <type>', 'Reporter: cli, json, junit, html', 'cli')
    .option('-o, --output <file>', 'Output file for reporter (stdout if omitted)')
    .option('--reporter-json <file>', 'Generate JSON report at path')
    .option('--reporter-junit <file>', 'Generate JUnit XML report at path')
    .option('--reporter-html <file>', 'Generate HTML report at path')
    .option('--reporter-skip-headers', 'Omit headers from reports')
    .option('--reporter-skip-request-body', 'Omit request bodies from reports')
    .option('--reporter-skip-response-body', 'Omit response bodies from reports')
    .option('--reporter-skip-body', 'Omit both request and response bodies from reports')
    .option('--silent', 'Suppress progress output')
    .option('--verbose', 'Show detailed request/response information')
    .option('--insecure', 'Disable SSL certificate verification')
    .option('--cacert <file>', 'Custom CA certificate file path')
    .option('--client-cert-config <file>', 'Client certificate config JSON for mTLS')
    .option('--proxy <url>', 'HTTP/HTTPS/SOCKS5 proxy URL')
    .option('--noproxy', 'Disable all proxy settings')
    .option('--disable-cookies', 'Do not automatically handle cookies')
    .option('--tags <tags>', 'Only run requests with ALL specified tags (comma-separated)')
    .option('--exclude-tags <tags>', 'Skip requests with ANY of the specified tags (comma-separated)')
    .action(async (collectionFile: string, options: RunOptions) => {
      try {
        await executeRun(collectionFile, options);
      } catch (err: any) {
        const exitCode = err instanceof CliError ? err.exitCode : EXIT.OTHER_ERROR;
        console.error(`\n  Error: ${err.message}\n`);
        process.exit(exitCode);
      }
    });
}

async function buildSslConfig(options: RunOptions): Promise<Record<string, any> | undefined> {
  const ssl: Record<string, any> = {};
  let hasSsl = false;

  if (options.insecure) {
    ssl.rejectUnauthorized = false;
    hasSsl = true;
  }

  if (options.cacert) {
    const caPath = path.resolve(options.cacert);
    try {
      ssl.ca = await fs.readFile(caPath);
    } catch (err: any) {
      throw new CliError(`CA certificate file not found: ${caPath}`, EXIT.FILE_NOT_FOUND);
    }
    hasSsl = true;
  }

  if (options.clientCertConfig) {
    const configPath = path.resolve(options.clientCertConfig);
    let configContent: string;
    try {
      configContent = await fs.readFile(configPath, 'utf-8');
    } catch (err: any) {
      throw new CliError(`Client cert config not found: ${configPath}`, EXIT.FILE_NOT_FOUND);
    }
    const certConfig = JSON.parse(configContent);
    if (certConfig.cert) {
      ssl.cert = await fs.readFile(path.resolve(path.dirname(configPath), certConfig.cert));
    }
    if (certConfig.key) {
      ssl.key = await fs.readFile(path.resolve(path.dirname(configPath), certConfig.key));
    }
    if (certConfig.passphrase) {
      ssl.passphrase = certConfig.passphrase;
    }
    hasSsl = true;
  }

  return hasSsl ? ssl : undefined;
}

function parseProxyUrl(urlStr: string): { protocol: string; host: string; port: number; username?: string; password?: string } {
  const url = new URL(urlStr);
  return {
    protocol: url.protocol.replace(':', ''),
    host: url.hostname,
    port: parseInt(url.port, 10) || (url.protocol === 'https:' ? 443 : 1080),
    username: url.username || undefined,
    password: url.password || undefined,
  };
}

function buildProxyConfig(options: RunOptions): Record<string, any> | undefined {
  if (options.noproxy) return undefined;

  const proxyUrl = options.proxy
    || process.env.HTTPS_PROXY
    || process.env.https_proxy
    || process.env.HTTP_PROXY
    || process.env.http_proxy;

  if (!proxyUrl) return undefined;

  const parsed = parseProxyUrl(proxyUrl);
  return {
    enabled: true,
    ...parsed,
    noProxy: process.env.NO_PROXY || process.env.no_proxy || '',
  };
}

async function executeRun(collectionFile: string, options: RunOptions): Promise<void> {
  const collection = await CollectionLoader.loadCollection(collectionFile);

  let envData: EnvironmentsData = {
    environments: [],
    activeId: null,
    globalVariables: [],
  };

  if (options.env) {
    envData = await CollectionLoader.loadEnvironments(options.env);
  }

  // Load .env file variables (lowest priority layer)
  let envFileVariables = undefined;
  if (options.envFile) {
    envFileVariables = await CollectionLoader.loadDotEnvFile(options.envFile);
  }

  // Activate environment by name if specified
  let envName: string | undefined;
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
    envName = env.name;
  } else if (envData.activeId) {
    const activeEnv = envData.environments.find(e => e.id === envData.activeId);
    envName = activeEnv?.name;
  }

  // Apply --env-var overrides (highest priority — inject into active env)
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

  // Parse tag filters
  const tags = options.tags ? options.tags.split(',').map(t => t.trim()) : undefined;
  const excludeTags = options.excludeTags ? options.excludeTags.split(',').map(t => t.trim()) : undefined;

  const requests = CollectionLoader.getRequests(collection, options.folder, tags, excludeTags);
  if (requests.length === 0) {
    throw new CliError('No requests found in the collection', EXIT.INVALID_COLLECTION);
  }

  // Load data file (optional)
  let dataRows = undefined;
  if (options.data) {
    dataRows = await CollectionLoader.loadDataFile(options.data);
    if (dataRows.length === 0) {
      throw new CliError('Data file is empty', EXIT.FILE_NOT_FOUND);
    }
  }

  const collectionVariables = collection.variables || [];

  // Build SSL and proxy configs
  const ssl = await buildSslConfig(options);
  const proxy = buildProxyConfig(options);

  const config: CollectionRunConfig = {
    collectionId: collection.id,
    stopOnFailure: options.stopOnFailure || false,
    delayMs: options.delay ? parseInt(options.delay, 10) : 0,
    timeoutMs: options.timeout ? parseInt(options.timeout, 10) : 30000,
    iterations: options.iterations ? parseInt(options.iterations, 10) : 1,
    parallel: options.parallel || false,
    ssl,
    proxy,
  };

  // Set up reporter
  const reporterType = options.reporter as RunnerExportFormat | 'cli';
  const reporter = new ConsoleReporter({
    silent: options.silent || reporterType !== 'cli',
    verbose: options.verbose,
  });
  reporter.start(collection.name, requests.length, envName);

  // Run collection
  const runner = new CollectionRunnerService();
  if (!options.disableCookies) {
    runner.setCookieContext(new CliCookieContext());
  }
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
    envFileVariables,
  );

  reporter.finish(result);

  // Collect all reporter outputs to generate
  const reporterOutputs: { format: RunnerExportFormat; file: string }[] = [];

  // Single --reporter + --output (backward compat)
  if (reporterType !== 'cli') {
    reporterOutputs.push({
      format: reporterType as RunnerExportFormat,
      file: options.output || '',
    });
  }

  // Multiple --reporter-* flags
  if (options.reporterJson) reporterOutputs.push({ format: 'json', file: options.reporterJson });
  if (options.reporterJunit) reporterOutputs.push({ format: 'junit', file: options.reporterJunit });
  if (options.reporterHtml) reporterOutputs.push({ format: 'html', file: options.reporterHtml });

  if (reporterOutputs.length > 0) {
    const exporter = new RunnerExportService();
    const reportData = {
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
    };

    // Redact sensitive values in headers
    redactReportResults(reportData.results);

    // Apply strip options
    if (options.reporterSkipHeaders || options.reporterSkipBody ||
        options.reporterSkipRequestBody || options.reporterSkipResponseBody) {
      for (const r of reportData.results) {
        if (options.reporterSkipHeaders) {
          (r as any).responseHeaders = undefined;
        }
        if (options.reporterSkipBody || options.reporterSkipResponseBody) {
          (r as any).responseData = undefined;
        }
      }
    }

    for (const { format, file } of reporterOutputs) {
      const reportContent = exporter.format(format, reportData);
      if (file) {
        const outputPath = path.resolve(file);
        await fs.writeFile(outputPath, reportContent, 'utf-8');
        if (!options.silent) {
          console.log(`  Report written to: ${outputPath}`);
        }
      } else {
        process.stdout.write(reportContent);
      }
    }
    if (!options.silent && reporterOutputs.some(r => r.file)) {
      console.log();
    }
  }

  process.exit(result.failedRequests > 0 ? EXIT.TEST_FAILURE : EXIT.SUCCESS);
}
