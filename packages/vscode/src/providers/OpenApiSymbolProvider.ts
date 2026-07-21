import * as vscode from 'vscode';
import {
  buildJsonPointer,
  getAdditionalOperations,
  OPENAPI_OPERATION_METHODS,
} from '@nouto/core/services';
import {
  buildPointerMap,
  detectOpenApiDocument,
  getOpenApiAnalysis,
  hasEverBeenOpenApi,
  pointerToRange,
} from '../services/openapi';
import type { OpenApiPointerMap } from '../services/openapi';

const COMPONENT_KINDS: Record<string, vscode.SymbolKind> = {
  schemas: vscode.SymbolKind.Class,
  responses: vscode.SymbolKind.Object,
  parameters: vscode.SymbolKind.Variable,
  examples: vscode.SymbolKind.Object,
  requestBodies: vscode.SymbolKind.Object,
  headers: vscode.SymbolKind.Field,
  securitySchemes: vscode.SymbolKind.Interface,
  links: vscode.SymbolKind.Object,
  callbacks: vscode.SymbolKind.Event,
  pathItems: vscode.SymbolKind.Namespace,
};

const COMPONENT_SECTIONS = Object.keys(COMPONENT_KINDS);

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

export class OpenApiSymbolProvider implements vscode.DocumentSymbolProvider {
  provideDocumentSymbols(
    document: vscode.TextDocument,
    token: vscode.CancellationToken
  ): vscode.DocumentSymbol[] {
    if (!hasEverBeenOpenApi(document.uri) && !detectOpenApiDocument(document).isOpenApi) return [];

    const analysis = getOpenApiAnalysis(document);
    const spec = asRecord(analysis.parsedSpec);
    if (!spec) return [];

    const pointerMap = buildPointerMap(document);
    const fallback = new vscode.Range(0, 0, 0, 0);
    const rangeFor = (segments: string[]): vscode.Range => {
      for (let length = segments.length; length >= 0; length--) {
        const range = pointerToRange(pointerMap, buildJsonPointer(segments.slice(0, length)));
        if (range) return range;
      }
      return fallback;
    };
    const symbol = (
      name: string,
      detail: string,
      kind: vscode.SymbolKind,
      segments: string[]
    ): vscode.DocumentSymbol => {
      const range = rangeFor(segments);
      return new vscode.DocumentSymbol(name, detail, kind, range, range);
    };

    const result: vscode.DocumentSymbol[] = [];

    const info = asRecord(spec.info);
    if (info) {
      const title = typeof info.title === 'string' ? info.title : '';
      const version = typeof info.version === 'string' ? `v${info.version}` : '';
      result.push(symbol('info', [title, version].filter(Boolean).join(' '), vscode.SymbolKind.File, ['info']));
    }
    if (token.isCancellationRequested) return result;

    const paths = asRecord(spec.paths);
    if (paths && analysis.operations.length > 0) {
      const pathsSymbol = symbol('paths', '', vscode.SymbolKind.Module, ['paths']);
      const byPath = new Map<string, typeof analysis.operations>();
      for (const operation of analysis.operations) {
        const group = byPath.get(operation.path) ?? [];
        group.push(operation);
        byPath.set(operation.path, group);
      }
      for (const path of Object.keys(paths)) {
        const operations = byPath.get(path);
        if (!operations?.length) continue;
        const pathSymbol = symbol(
          path,
          `${operations.length} operation${operations.length === 1 ? '' : 's'}`,
          vscode.SymbolKind.Namespace,
          ['paths', path]
        );
        pathSymbol.children = operations.map((operation) => {
          const range = pointerToRange(pointerMap, operation.pointer) ?? rangeFor(['paths', path]);
          return new vscode.DocumentSymbol(
            `${operation.method.toUpperCase()} ${path}`,
            operation.summary ?? operation.operationId ?? '',
            vscode.SymbolKind.Method,
            range,
            range
          );
        });
        pathsSymbol.children.push(pathSymbol);
      }
      if (pathsSymbol.children.length) result.push(pathsSymbol);
    }
    if (token.isCancellationRequested) return result;

    const components = asRecord(spec.components);
    if (components) {
      const componentSymbol = symbol('components', '', vscode.SymbolKind.Namespace, ['components']);
      for (const section of COMPONENT_SECTIONS) {
        const values = asRecord(components[section]);
        if (!values || Object.keys(values).length === 0) continue;
        const sectionSymbol = symbol(section, '', vscode.SymbolKind.Namespace, ['components', section]);
        for (const name of Object.keys(values)) {
          sectionSymbol.children.push(symbol(
            name,
            '',
            COMPONENT_KINDS[section],
            ['components', section, name]
          ));
        }
        componentSymbol.children.push(sectionSymbol);
      }
      if (componentSymbol.children.length) result.push(componentSymbol);
    }
    if (token.isCancellationRequested) return result;

    const webhooks = analysis.version === '3.0' ? undefined : asRecord(spec.webhooks);
    if (webhooks) {
      const webhooksSymbol = symbol('webhooks', '', vscode.SymbolKind.Event, ['webhooks']);
      for (const [name, value] of Object.entries(webhooks)) {
        const pathItem = asRecord(value);
        if (!pathItem) continue;
        const webhookSymbol = symbol(name, '', vscode.SymbolKind.Namespace, ['webhooks', name]);
        for (const method of OPENAPI_OPERATION_METHODS) {
          if (!asRecord(pathItem[method])) continue;
          webhookSymbol.children.push(symbol(
            `${method.toUpperCase()} ${name}`,
            operationDetail(pathItem[method]),
            vscode.SymbolKind.Method,
            ['webhooks', name, method]
          ));
        }
        const additional = getAdditionalOperations(pathItem);
        if (additional) {
          for (const [method, operation] of Object.entries(additional)) {
            if (!asRecord(operation)) continue;
            webhookSymbol.children.push(symbol(
              `${method.toUpperCase()} ${name}`,
              operationDetail(operation),
              vscode.SymbolKind.Method,
              ['webhooks', name, 'additionalOperations', method]
            ));
          }
        }
        if (webhookSymbol.children.length) webhooksSymbol.children.push(webhookSymbol);
      }
      if (webhooksSymbol.children.length) result.push(webhooksSymbol);
    }

    return result;
  }
}

function operationDetail(value: unknown): string {
  const operation = asRecord(value);
  if (!operation) return '';
  return typeof operation.summary === 'string'
    ? operation.summary
    : typeof operation.operationId === 'string'
      ? operation.operationId
      : '';
}
