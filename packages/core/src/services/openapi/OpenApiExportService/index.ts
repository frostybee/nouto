import type { Collection, CollectionItem, SavedRequest, BodyState } from '../../../types';
import { isFolder, isRequest } from '../../../types';
import {
  getItemPath,
  resolveAuthForRequest,
  resolveHeadersForRequest,
  resolveVariablesForRequest,
} from '../../InheritanceService';
import { parseHarEntries } from '../../harParsing';
import type { HarEntry } from '../../harParsing';
import type {
  NormalizedBody,
  NormalizedOperation,
  NormalizedParam,
  NormalizedSecurity,
  OpenApiExportOptions,
  OpenApiExportResult,
} from '../types';
import {
  dedupeParams,
  EXPORTABLE_METHODS,
  harBody,
  harResponses,
  IGNORED_HAR_HEADERS,
  IGNORED_HEADER_PARAMS,
  keyValueToParam,
  parseFormFields,
  responsesFromExamples,
  splitUrl,
  substituteVariables,
  templatePath,
  toVariableMap,
} from './normalize';
import { buildOperationId, mergeCollidingOperations, renderOperation } from './render';
import { buildSecurityScheme, securityFromAuthorizationHeader, uniqueSchemeName } from './security';

/**
 * Contract generator — the reverse of OpenApiImportService: emits an OpenAPI
 * 3.1 document from a Nouto collection or a HAR file. Both sources funnel
 * into a shared NormalizedOperation pipeline, so templating, merging, and
 * document assembly behave identically regardless of origin.
 *
 * Heuristics are deliberately conservative (v1): concrete numeric/UUID path
 * segments template to named parameters, colliding (method, path) sources
 * merge into one operation, body/response schemas come from multi-sample
 * inference, and auth maps only to standard security schemes (AWS SigV4 and
 * NTLM have none — those requests export without security, with a warning).
 *
 * Implementation lives in sibling modules: `normalize.ts` (input shaping),
 * `security.ts` (scheme inference), `render.ts` (merging + rendering).
 */
export class OpenApiExportService {
  fromCollection(collection: Collection, options?: OpenApiExportOptions): OpenApiExportResult {
    const documentWarnings: string[] = [];
    const operations = this.collectFromCollection(collection, documentWarnings);
    if (!operations.length) documentWarnings.push('Collection contains no exportable requests');
    return this.buildDocument(
      operations,
      options?.title ?? collection.name,
      options?.version ?? '1.0.0',
      documentWarnings
    );
  }

  fromHar(harContent: string, options?: OpenApiExportOptions): OpenApiExportResult {
    const { entries } = parseHarEntries(harContent);
    const documentWarnings: string[] = [];
    const operations = this.collectFromHar(entries, documentWarnings);
    if (!operations.length) documentWarnings.push('HAR file contains no exportable requests');
    return this.buildDocument(
      operations,
      options?.title ?? 'HAR-derived API',
      options?.version ?? '1.0.0',
      documentWarnings
    );
  }

  // ------------------------------------------------------------------------
  // Collection source
  // ------------------------------------------------------------------------

  private collectFromCollection(collection: Collection, documentWarnings: string[]): NormalizedOperation[] {
    const operations: NormalizedOperation[] = [];
    const walk = (items: CollectionItem[], folderName: string | undefined) => {
      for (const item of items) {
        if (isFolder(item)) {
          walk(item.children, item.name);
        } else if (isRequest(item)) {
          const operation = this.normalizeRequest(collection, item, folderName, documentWarnings);
          if (operation) operations.push(operation);
        }
      }
    };
    walk(collection.items, undefined);
    return operations;
  }

  private normalizeRequest(
    collection: Collection,
    request: SavedRequest,
    folderName: string | undefined,
    documentWarnings: string[]
  ): NormalizedOperation | undefined {
    const method = (request.method || 'GET').toUpperCase();
    if (!EXPORTABLE_METHODS.has(method.toLowerCase())) {
      documentWarnings.push(`${method} ${request.url}: method has no OpenAPI 3.1 operation key; skipped`);
      return undefined;
    }

    const warnings: string[] = [];
    const ancestors = getItemPath(collection, request.id);
    const { auth } = resolveAuthForRequest(collection, ancestors, request);
    const headers = resolveHeadersForRequest(collection, ancestors, request);
    const variables = toVariableMap(resolveVariablesForRequest(collection, ancestors));

    const url = substituteVariables(request.url ?? '', variables);
    const { server, pathname, embeddedQuery } = splitUrl(url, warnings);
    const { path, params: pathParams } = templatePath(pathname, request.pathParams);

    const queryParams = [
      ...(request.params ?? []).map((p) => keyValueToParam(p, variables)),
      ...embeddedQuery,
    ];
    const headerParams = headers
      .filter((h) => h.enabled && h.key && !IGNORED_HEADER_PARAMS.has(h.key.toLowerCase()))
      .map((h) => keyValueToParam(h, variables));

    const security: NormalizedSecurity[] = [];
    const scheme = buildSecurityScheme(auth, warnings);
    if (scheme) security.push(scheme);

    return {
      method,
      rawPath: pathname,
      path,
      pathParams,
      queryParams: dedupeParams(queryParams),
      headerParams: dedupeParams(headerParams),
      tags: folderName ? [folderName] : [],
      summary: request.name || undefined,
      server,
      requestBody: this.mapBody(request.body, variables, warnings),
      responses: responsesFromExamples(request),
      security,
      warnings,
    };
  }

  private mapBody(
    body: BodyState | undefined,
    variables: Map<string, string>,
    warnings: string[]
  ): NormalizedBody | undefined {
    if (!body || body.type === 'none') return undefined;
    const content = substituteVariables(body.content ?? '', variables);

    switch (body.type) {
      case 'json': {
        if (!content.trim()) return undefined;
        try {
          return { contentType: 'application/json', samples: [JSON.parse(content)] };
        } catch {
          warnings.push('request body is not valid JSON; exported without a schema');
          return { contentType: 'application/json', samples: [], rawExampleText: content };
        }
      }
      case 'graphql': {
        warnings.push('GraphQL operation exported as a generic JSON request body');
        let graphqlVariables: unknown = {};
        if (body.graphqlVariables) {
          try {
            graphqlVariables = JSON.parse(body.graphqlVariables);
          } catch {
            // Unparseable variables — keep the empty object.
          }
        }
        return {
          contentType: 'application/json',
          samples: [{ query: content, variables: graphqlVariables }],
        };
      }
      case 'form-data':
      case 'x-www-form-urlencoded': {
        const contentType =
          body.type === 'form-data' ? 'multipart/form-data' : 'application/x-www-form-urlencoded';
        const { fields, fileFields } = parseFormFields(content);
        if (!Object.keys(fields).length) return { contentType, samples: [] };
        return {
          contentType,
          samples: [fields],
          fileFields: fileFields.length ? fileFields : undefined,
        };
      }
      case 'binary':
        return { contentType: 'application/octet-stream', samples: [] };
      case 'xml':
        return { contentType: 'application/xml', samples: [], rawExampleText: content || undefined };
      default:
        return { contentType: 'text/plain', samples: [], rawExampleText: content || undefined };
    }
  }

  // ------------------------------------------------------------------------
  // HAR source
  // ------------------------------------------------------------------------

  private collectFromHar(entries: HarEntry[], documentWarnings: string[]): NormalizedOperation[] {
    const domains = new Set<string>();
    for (const entry of entries) {
      try {
        domains.add(new URL(entry.request.url).hostname);
      } catch {
        domains.add('Unknown');
      }
    }
    const tagByDomain = domains.size > 1;

    const operations: NormalizedOperation[] = [];
    for (const entry of entries) {
      const operation = this.normalizeHarEntry(entry, tagByDomain, documentWarnings);
      if (operation) operations.push(operation);
    }
    return operations;
  }

  private normalizeHarEntry(
    entry: HarEntry,
    tagByDomain: boolean,
    documentWarnings: string[]
  ): NormalizedOperation | undefined {
    const request = entry.request;
    const method = (request.method || 'GET').toUpperCase();
    if (!EXPORTABLE_METHODS.has(method.toLowerCase())) {
      documentWarnings.push(`${method} ${request.url}: method has no OpenAPI 3.1 operation key; skipped`);
      return undefined;
    }

    const warnings: string[] = [];
    const { server, pathname, embeddedQuery } = splitUrl(request.url ?? '', warnings);
    const { path, params: pathParams } = templatePath(pathname);

    let domain: string | undefined;
    try {
      domain = new URL(request.url).hostname;
    } catch {
      domain = 'Unknown';
    }

    const queryParams = [
      ...(request.queryString ?? []).map((q) => ({ name: q.name, required: true, example: q.value || undefined })),
      ...embeddedQuery,
    ].filter((p) => p.name);

    const headerParams: NormalizedParam[] = [];
    const security: NormalizedSecurity[] = [];
    for (const header of request.headers ?? []) {
      const name = header.name?.toLowerCase();
      if (name === 'authorization') {
        const scheme = securityFromAuthorizationHeader(header.value);
        if (scheme) security.push(scheme);
        continue;
      }
      if (!name || name.startsWith(':') || name.startsWith('sec-') || IGNORED_HAR_HEADERS.has(name)) continue;
      headerParams.push({ name: header.name, required: true, example: header.value || undefined });
    }

    return {
      method,
      rawPath: pathname,
      path,
      pathParams,
      queryParams: dedupeParams(queryParams),
      headerParams: dedupeParams(headerParams),
      tags: tagByDomain && domain ? [domain] : [],
      server,
      requestBody: harBody(request.postData, warnings),
      responses: harResponses(entry),
      security,
      warnings,
    };
  }

  // ------------------------------------------------------------------------
  // Document assembly
  // ------------------------------------------------------------------------

  private buildDocument(
    operations: NormalizedOperation[],
    title: string,
    version: string,
    documentWarnings: string[]
  ): OpenApiExportResult {
    const merged = mergeCollidingOperations(operations);

    // Deduped security schemes, named for components.securitySchemes.
    const schemeNames = new Map<string, string>();
    const securitySchemes: Record<string, unknown> = {};
    for (const operation of merged) {
      for (const { key, scheme } of operation.security) {
        if (schemeNames.has(key)) continue;
        const name = uniqueSchemeName(key, new Set(schemeNames.values()));
        schemeNames.set(key, name);
        securitySchemes[name] = scheme;
      }
    }

    // Hoist to global security only when every operation carries exactly the
    // same single scheme.
    const firstKey = merged[0]?.security[0]?.key;
    const hoist =
      merged.length > 0 &&
      firstKey !== undefined &&
      merged.every((op) => op.security.length === 1 && op.security[0].key === firstKey);

    const servers: { url: string }[] = [];
    for (const operation of merged) {
      if (operation.server && !servers.some((s) => s.url === operation.server!.url)) {
        servers.push(operation.server);
      }
    }
    if (merged.length && !servers.length) {
      documentWarnings.push('No server URL could be determined; the document has no servers entry');
    }

    const usedOperationIds = new Set<string>();
    const paths: Record<string, Record<string, unknown>> = {};
    const warnings: string[] = [...documentWarnings];
    for (const operation of merged) {
      const pathItem = (paths[operation.path] ??= {});
      pathItem[operation.method.toLowerCase()] = renderOperation(
        operation,
        buildOperationId(operation.method, operation.path, usedOperationIds),
        !hoist,
        schemeNames
      );
      warnings.push(...operation.warnings.map((w) => `${operation.method} ${operation.path}: ${w}`));
    }

    const document: Record<string, unknown> = {
      openapi: '3.1.0',
      info: { title, version },
    };
    if (servers.length) document.servers = servers;
    if (hoist) document.security = [{ [schemeNames.get(firstKey!)!]: [] }];
    document.paths = paths;
    if (Object.keys(securitySchemes).length) {
      document.components = { securitySchemes };
    }

    return { document, warnings: [...new Set(warnings)] };
  }
}
