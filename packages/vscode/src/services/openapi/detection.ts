import * as yaml from 'js-yaml';
import type * as vscode from 'vscode';
import { detectOpenApiVersion } from '@nouto/core/services';
import type { OpenApiVersion } from '@nouto/core/services';

export interface DetectionResult {
  isOpenApi: boolean;
  version?: OpenApiVersion;
}

interface CachedDetection {
  documentVersion: number;
  result: DetectionResult;
}

const SUPPORTED_LANGUAGES = new Set(['json', 'yaml', 'jsonc']);
const OPENAPI_FIELD = /["']?openapi["']?\s*:\s*["']?3\.\d+/;
const detectionCache = new Map<string, CachedDetection>();

function uriKey(uri: vscode.Uri): string {
  return uri.toString();
}

export function detectOpenApiDocument(document: vscode.TextDocument): DetectionResult {
  if (!SUPPORTED_LANGUAGES.has(document.languageId)) return { isOpenApi: false };

  const key = uriKey(document.uri);
  const cached = detectionCache.get(key);
  if (cached?.documentVersion === document.version) return cached.result;

  const content = document.getText();
  let result: DetectionResult = { isOpenApi: false };

  if (OPENAPI_FIELD.test(content)) {
    try {
      // js-yaml is intentionally used only after the regex gate. YAML is a
      // superset of JSON, so this keeps detection cheap and format-neutral.
      const parsed = yaml.load(content);
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const version = detectOpenApiVersion((parsed as Record<string, unknown>).openapi);
        if (version) result = { isOpenApi: true, version };
      }
    } catch {
      // A partially typed document is not recognized until it parses once.
    }
  }

  detectionCache.set(key, { documentVersion: document.version, result });
  return result;
}

export function isOpenApiDocument(document: vscode.TextDocument): boolean {
  return detectOpenApiDocument(document).isOpenApi;
}

export function clearDetectionCache(uri: vscode.Uri): void {
  detectionCache.delete(uriKey(uri));
}
