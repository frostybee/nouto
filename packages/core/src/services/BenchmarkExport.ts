import type { BenchmarkConfig, BenchmarkIteration, BenchmarkStatistics } from '../types';

export type BenchmarkExportFormat = 'json' | 'csv';

export interface BenchmarkExportInput {
  requestName: string;
  method: string;
  url: string;
  config: BenchmarkConfig;
  statistics: BenchmarkStatistics | null | undefined;
  iterations: BenchmarkIteration[];
}

export interface BenchmarkExportFile {
  content: string;
  fileName: string;
}

/**
 * Build the file written by **Export JSON** and **Export CSV** on the Benchmark panel.
 * Both apps share this so the two exports stay identical.
 */
export function buildBenchmarkExport(format: BenchmarkExportFormat, input: BenchmarkExportInput): BenchmarkExportFile {
  const baseName = (input.requestName || 'benchmark').replace(/[^a-zA-Z0-9]/g, '_');

  if (format === 'csv') {
    const header = '#,Status,StatusText,Duration(ms),Size,Success,Error';
    const rows = input.iterations.map(
      (r, i) =>
        `${i + 1},${r.status},${r.statusText || ''},${r.duration},${r.size},${r.success ? 'Yes' : 'No'},"${(r.error || '').replace(/"/g, '""')}"`,
    );
    return { content: [header, ...rows].join('\n'), fileName: `${baseName}_benchmark.csv` };
  }

  const content = JSON.stringify(
    {
      requestName: input.requestName,
      method: input.method,
      url: input.url,
      config: input.config,
      statistics: input.statistics ?? null,
      iterations: input.iterations,
    },
    null,
    2,
  );
  return { content, fileName: `${baseName}_benchmark.json` };
}
