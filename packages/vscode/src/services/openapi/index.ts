export * from './analysisCache';
export * from './detection';
export * from './pointerMap';
export * from './yamlSyntax';
export * from './debounce';

import type * as vscode from 'vscode';
import { clearOpenApiAnalysis } from './analysisCache';
import { clearDetectionCache } from './detection';
import { clearPointerMap } from './pointerMap';

export function clearOpenApiDocumentState(uri: vscode.Uri): void {
  clearDetectionCache(uri);
  clearOpenApiAnalysis(uri);
  clearPointerMap(uri);
}
