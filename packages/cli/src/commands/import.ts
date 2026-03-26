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
import type { Collection, SavedRequest } from '@nouto/core';
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

  // Try parsing as JSON first
  try {
    const parsed = JSON.parse(content);

    // Postman v2.0/v2.1
    if (parsed.info?.schema?.includes('postman')) return 'postman';
    if (parsed.info?._postman_id) return 'postman';

    // Insomnia
    if (parsed._type === 'export' || parsed.__export_format) return 'insomnia';

    // Hoppscotch
    if (Array.isArray(parsed) && parsed[0]?.v && parsed[0]?.name) return 'hoppscotch';

    // Thunder Client
    if (Array.isArray(parsed) && parsed[0]?.containerId !== undefined) return 'thunder-client';

    // HAR
    if (parsed.log?.version && parsed.log?.entries) return 'har';

    // OpenAPI
    if (parsed.openapi || parsed.swagger) return 'openapi';

    // Nouto native (already our format)
    if (parsed._format === 'nouto') return 'postman'; // Will be handled by NativeExportService
  } catch {
    // Not JSON
  }

  // YAML-based formats
  if (ext === '.yaml' || ext === '.yml') return 'openapi';

  // .bru files
  if (ext === '.bru') return 'bruno';

  // Curl command
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
      collections = service.import(content);
      break;
    }
    case 'insomnia': {
      const service = new InsomniaImportService();
      collections = service.import(content);
      break;
    }
    case 'hoppscotch': {
      const service = new HoppscotchImportService();
      collections = service.import(content);
      break;
    }
    case 'thunder-client': {
      const service = new ThunderClientImportService();
      collections = service.import(content);
      break;
    }
    case 'har': {
      const service = new HarImportService();
      collections = service.import(content);
      break;
    }
    case 'openapi': {
      const service = new OpenApiImportService();
      collections = await service.import(content);
      break;
    }
    case 'curl': {
      const parsed = CurlParserService.parse(content);
      const request: SavedRequest = {
        type: 'request',
        id: generateId(),
        name: parsed.url || 'Imported Request',
        method: (parsed.method || 'GET') as any,
        url: parsed.url || '',
        params: parsed.params || [],
        headers: parsed.headers || [],
        auth: parsed.auth || { type: 'none' },
        body: parsed.body || { type: 'none', content: '' },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
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

  // Export as Nouto format
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
