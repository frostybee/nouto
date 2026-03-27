import type { Command } from 'commander';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  PostmanImportService,
  InsomniaImportService,
  HoppscotchImportService,
  ThunderClientImportService,
  HarImportService,
  BrunoImportService,
  OpenApiImportService,
  CurlParserService,
  NativeExportService,
} from '@nouto/core/services';
import type { Collection } from '@nouto/core';
import { generateId } from '@nouto/core';

type ImportFormat = 'postman' | 'insomnia' | 'hoppscotch' | 'thunder-client' | 'har' | 'bruno' | 'openapi' | 'curl' | 'auto';

interface ImportOptions {
  from?: string;
  output?: string;
}

export function registerImportCommand(program: Command): void {
  program
    .command('import')
    .description('Import a collection from another format')
    .argument('<file>', 'Path to the file to import')
    .option('--from <format>', 'Source format: postman, insomnia, hoppscotch, thunder-client, har, bruno, openapi, curl (default: auto-detect)')
    .option('-o, --output <file>', 'Output file (default: <name>.nouto.json)')
    .action(async (file: string, options: ImportOptions) => {
      try {
        await executeImport(file, options);
      } catch (err: any) {
        console.error(`\n  Error: ${err.message}\n`);
        process.exit(1);
      }
    });
}

function detectFormat(content: string, filePath: string): ImportFormat {
  const ext = path.extname(filePath).toLowerCase();

  try {
    const parsed = JSON.parse(content);
    if (parsed.info?.schema?.includes('postman')) return 'postman';
    if (parsed.info?._postman_id) return 'postman';
    if (parsed._type === 'export' || parsed.__export_format) return 'insomnia';
    if (Array.isArray(parsed) && parsed[0]?.v && parsed[0]?.name) return 'hoppscotch';
    if (Array.isArray(parsed) && parsed[0]?.containerId !== undefined) return 'thunder-client';
    if (parsed.log?.version && parsed.log?.entries) return 'har';
    if (parsed.openapi || parsed.swagger) return 'openapi';
  } catch {
    // Not JSON
  }

  if (ext === '.yaml' || ext === '.yml') return 'openapi';
  if (ext === '.bru') return 'bruno';
  if (content.trimStart().startsWith('curl ')) return 'curl';

  throw new Error('Could not auto-detect format. Use --from to specify.');
}

async function executeImport(filePath: string, options: ImportOptions): Promise<void> {
  const absolutePath = path.resolve(filePath);
  const content = await fs.readFile(absolutePath, 'utf-8');

  const format = (options.from as ImportFormat) || detectFormat(content, filePath);
  let collections: Collection[] = [];

  switch (format) {
    case 'postman': {
      const service = new PostmanImportService();
      const result = service.importFromString(content);
      collections = [result.collection];
      break;
    }
    case 'insomnia': {
      const service = new InsomniaImportService();
      const result = service.importFromString(content);
      collections = result.collections;
      break;
    }
    case 'hoppscotch': {
      const service = new HoppscotchImportService();
      const result = service.importFromString(content);
      collections = result.collections;
      break;
    }
    case 'thunder-client': {
      const service = new ThunderClientImportService();
      const result = service.importFromString(content);
      collections = result.collections;
      break;
    }
    case 'har': {
      const service = new HarImportService();
      const result = service.importFromString(content);
      collections = [result.collection];
      break;
    }
    case 'openapi': {
      const service = new OpenApiImportService();
      const result = service.importFromString(content);
      collections = [result.collection];
      break;
    }
    case 'bruno': {
      const service = new BrunoImportService();
      const result = service.importFromString(content, path.basename(filePath, path.extname(filePath)));
      collections = [result.collection];
      break;
    }
    case 'curl': {
      const service = new CurlParserService();
      const request = service.importFromString(content);
      collections = [{
        id: generateId(),
        name: 'Imported from cURL',
        items: [request],
        expanded: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }];
      break;
    }
    default:
      throw new Error(`Unsupported format: ${format}`);
  }

  if (collections.length === 0) {
    throw new Error('No collections found in the imported file');
  }

  const exporter = new NativeExportService();
  for (const collection of collections) {
    const exported = exporter.exportCollection(collection);
    const outputFile = options.output || `${sanitizeFileName(collection.name)}.nouto.json`;
    const outputPath = path.resolve(outputFile);
    await fs.writeFile(outputPath, JSON.stringify(exported, null, 2), 'utf-8');
    console.log(`  Imported: ${collection.name} -> ${outputPath}`);
  }
  console.log();
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_').toLowerCase();
}
