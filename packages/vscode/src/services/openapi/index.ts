export * from './analysisCache';
export * from './applyInsert';
export * from './bundleForRender';
export * from './vscodeFileResolver';
export * from './externalRefCompletion';
export * from './detection';
export * from './pointerMap';
export * from './specEdit';
export * from './specNaming';
export * from './yamlSyntax';
export * from './debounce';
export * from './standaloneDocs';
export * from './docsSnapshotManager';
export * from './openApiSettings';

import type * as vscode from 'vscode';
import { clearOpenApiAnalysis } from './analysisCache';
import { clearDetectionCache } from './detection';
import { clearPointerMap } from './pointerMap';

export function clearOpenApiDocumentState(uri: vscode.Uri): void {
  clearDetectionCache(uri);
  clearOpenApiAnalysis(uri);
  clearPointerMap(uri);
}
