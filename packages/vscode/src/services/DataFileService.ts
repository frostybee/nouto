import * as fs from 'fs/promises';
import Papa from 'papaparse';
import type { DataRow } from './types';

export async function parseDataFile(filePath: string, fileType: 'csv' | 'json'): Promise<DataRow[]> {
  const content = await fs.readFile(filePath, 'utf-8');

  if (fileType === 'csv') {
    const result = Papa.parse<DataRow>(content, {
      header: true,
      skipEmptyLines: true,
    });

    if (result.errors.length > 0 && result.data.length === 0) {
      throw new Error(`CSV parse error: ${result.errors[0].message}`);
    }

    return result.data;
  }

  // JSON
  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('Invalid JSON in data file');
  }

  if (Array.isArray(parsed)) {
    return parsed.map(row => {
      if (typeof row !== 'object' || row === null) {
        throw new Error('JSON data file must contain an array of objects');
      }
      // Convert all values to strings for variable substitution
      const stringRow: DataRow = {};
      for (const [key, value] of Object.entries(row)) {
        stringRow[key] = value === null || value === undefined ? '' : String(value);
      }
      return stringRow;
    });
  }

  if (typeof parsed === 'object' && parsed !== null) {
    // Single object — wrap in array
    const stringRow: DataRow = {};
    for (const [key, value] of Object.entries(parsed)) {
      stringRow[key] = value === null || value === undefined ? '' : String(value);
    }
    return [stringRow];
  }

  throw new Error('JSON data file must contain an object or array of objects');
}
