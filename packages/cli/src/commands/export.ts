import type { Command } from 'commander';
import * as fs from 'fs/promises';
import * as path from 'path';
import { CollectionLoader } from '../services/collection-loader';
import { NativeExportService, HarExportService } from '@nouto/core/services';

type ExportFormat = 'nouto' | 'har';

interface ExportOptions {
  to: string;
  output?: string;
}

export function registerExportCommand(program: Command): void {
  program
    .command('export')
    .description('Export a collection to another format')
    .argument('<collection-file>', 'Path to collection JSON file')
    .option('--to <format>', 'Target format: nouto, har', 'nouto')
    .option('-o, --output <file>', 'Output file')
    .action(async (collectionFile: string, options: ExportOptions) => {
      try {
        await executeExport(collectionFile, options);
      } catch (err: any) {
        console.error(`\n  Error: ${err.message}\n`);
        process.exit(1);
      }
    });
}

async function executeExport(collectionFile: string, options: ExportOptions): Promise<void> {
  const collection = await CollectionLoader.loadCollection(collectionFile);
  const format = options.to as ExportFormat;
  let output: string;
  let ext: string;

  switch (format) {
    case 'nouto': {
      const exporter = new NativeExportService();
      const exported = exporter.exportCollection(collection);
      output = JSON.stringify(exported, null, 2);
      ext = 'nouto.json';
      break;
    }
    case 'har': {
      const exporter = new HarExportService();
      output = exporter.exportCollectionItems(collection.items);
      ext = 'har';
      break;
    }
    default:
      throw new Error(`Unsupported export format: ${format}. Use: nouto, har`);
  }

  const outputFile = options.output || `${sanitizeFileName(collection.name)}.${ext}`;
  const outputPath = path.resolve(outputFile);
  await fs.writeFile(outputPath, output, 'utf-8');
  console.log(`  Exported: ${collection.name} -> ${outputPath}\n`);
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_').toLowerCase();
}
