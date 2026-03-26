import type { Command } from 'commander';
import * as fs from 'fs/promises';
import * as path from 'path';
import { CollectionLoader } from '../services/collection-loader';
import { findRequestRecursive, getAllRequestsFromItems } from '@nouto/core/services';
import { getTargets, generateCode } from '@nouto/core/codegen';
import type { SavedRequest } from '@nouto/core';

interface CodegenOptions {
  request: string;
  target: string;
  output?: string;
  listTargets?: boolean;
}

export function registerCodegenCommand(program: Command): void {
  program
    .command('codegen')
    .description('Generate code from a request in a collection')
    .argument('[collection-file]', 'Path to collection JSON file')
    .option('--request <name-or-id>', 'Request name or ID')
    .option('-t, --target <lang>', 'Target language (use --list-targets to see all)')
    .option('-o, --output <file>', 'Output file (stdout if omitted)')
    .option('--list-targets', 'List available code generation targets')
    .action(async (collectionFile: string | undefined, options: CodegenOptions) => {
      try {
        if (options.listTargets) {
          const targets = getTargets();
          console.log('\n  Available code generation targets:\n');
          for (const t of targets) {
            console.log(`    ${t.id.padEnd(20)} ${t.label}`);
          }
          console.log();
          return;
        }

        if (!collectionFile) {
          throw new Error('Collection file is required (unless using --list-targets)');
        }
        if (!options.request) {
          throw new Error('--request is required');
        }
        if (!options.target) {
          throw new Error('--target is required (use --list-targets to see options)');
        }

        await executeCodegen(collectionFile, options);
      } catch (err: any) {
        console.error(`\n  Error: ${err.message}\n`);
        process.exit(1);
      }
    });
}

async function executeCodegen(collectionFile: string, options: CodegenOptions): Promise<void> {
  const collection = await CollectionLoader.loadCollection(collectionFile);

  // Find request by ID or name
  let request: SavedRequest | null = findRequestRecursive(collection.items, options.request);
  if (!request) {
    const allRequests = getAllRequestsFromItems(collection.items);
    request = allRequests.find(r => r.name.toLowerCase() === options.request.toLowerCase()) || null;
  }
  if (!request) {
    throw new Error(`Request "${options.request}" not found in collection`);
  }

  const code = generateCode(options.target, {
    method: request.method,
    url: request.url,
    headers: (request.headers || []).filter(h => h.enabled).map(h => ({ key: h.key, value: h.value })),
    params: (request.params || []).filter(p => p.enabled).map(p => ({ key: p.key, value: p.value })),
    body: request.body,
    auth: request.auth,
  });

  if (options.output) {
    const outputPath = path.resolve(options.output);
    await fs.writeFile(outputPath, code, 'utf-8');
    console.log(`  Code generated: ${outputPath}\n`);
  } else {
    process.stdout.write(code + '\n');
  }
}
