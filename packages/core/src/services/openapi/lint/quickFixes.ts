import type { OpenApiAnalysis, OpenApiDiagnostic } from '../types';
import { getByPointer } from '../pointer';
import { isRefNode } from '../refs';
import {
  planDeleteAtPointer,
  planInsertArrayItem,
  planInsertObjectMember,
  planRenameObjectKey,
  planSetScalarAtPointer,
} from '../specEdit';
import type { SpecDocument, SpecTextEdit } from '../specEdit';
import { classifyPathSegment, deriveOperationId, humanizeIdentifier, uniqueName } from '../specNaming';
import { RATE_LIMIT_HEADERS } from '../specSkeletons';
import { isRecord, securitySchemes, specOf } from './context';

/**
 * A quick fix for a lint diagnostic. `key` identifies the fix independently of
 * which rule produced it: `operation-missing-4xx` and `operation-missing-5xx`
 * both resolve to the same "add a default response" edit, and hosts dedupe on
 * `key` so the lightbulb lists it once. Document-wide fixes (a global security
 * requirement) share one key across every operation they clear.
 */
export interface LintQuickFix {
  key: string;
  title: string;
  edits: SpecTextEdit[];
}

type LintFixBuilder = (
  doc: SpecDocument,
  diagnostic: OpenApiDiagnostic,
  analysis: OpenApiAnalysis
) => LintQuickFix[];

/** Placeholder bounds inserted by the `parameter-unbounded` fix. */
export const UNBOUNDED_PARAMETER_FIX = { maxLength: 255, maxItems: 100 } as const;

/** Fix key scoped to the node it edits (`key@pointer`), so hosts can dedupe. */
const at = (key: string, pointer: string) => `${key}@${pointer}`;

const one = (fix: LintQuickFix | undefined): LintQuickFix[] => (fix ? [fix] : []);

function operationFor(analysis: OpenApiAnalysis, pointer: string | undefined) {
  if (pointer === undefined) return undefined;
  return analysis.operations.find((operation) => operation.pointer === pointer);
}

function valueAt(analysis: OpenApiAnalysis, pointer: string): unknown {
  const resolved = getByPointer(analysis.parsedSpec ?? {}, pointer);
  return resolved.found ? resolved.value : undefined;
}

const addDefaultResponse: LintFixBuilder = (doc, diagnostic, analysis) => {
  const pointer = diagnostic.pointer;
  if (!pointer) return [];
  const responses = valueAt(analysis, pointer);
  if (!isRecord(responses) || 'default' in responses) return [];
  const plan = planInsertObjectMember(doc, pointer, 'default', {
    description: 'Unexpected error',
  });
  return one(
    plan && { key: at('add-default-response', pointer), title: 'Add "default" response', edits: plan.edits }
  );
};

/** Rewrites the server url string at `pointer` when `rewrite` changes it. */
function rewriteServerUrl(
  doc: SpecDocument,
  diagnostic: OpenApiDiagnostic,
  analysis: OpenApiAnalysis,
  key: string,
  title: string,
  rewrite: (url: string) => string
): LintQuickFix[] {
  const pointer = diagnostic.pointer;
  if (!pointer) return [];
  const url = valueAt(analysis, pointer);
  if (typeof url !== 'string') return [];
  const next = rewrite(url);
  if (next === url) return [];
  const edits = planSetScalarAtPointer(doc, pointer, next);
  return one(edits && { key: at(key, pointer), title, edits });
}

const LINT_FIX_BUILDERS: Record<string, LintFixBuilder> = {
  'operation-missing-4xx': addDefaultResponse,
  'operation-missing-5xx': addDefaultResponse,

  'parameter-unbounded': (doc, diagnostic, analysis) => {
    const pointer = diagnostic.pointer;
    if (!pointer) return [];
    // A `$ref` parameter (or schema) lives elsewhere, possibly shared: editing
    // it from a usage-site warning would be a surprising side effect.
    const parameter = valueAt(analysis, pointer);
    if (!isRecord(parameter) || isRefNode(parameter)) return [];
    const schema = parameter.schema;
    if (!isRecord(schema) || isRefNode(schema)) return [];
    const schemaPointer = `${pointer}/schema`;
    if (schema.type === 'string' && schema.maxLength === undefined) {
      const plan = planInsertObjectMember(doc, schemaPointer, 'maxLength', UNBOUNDED_PARAMETER_FIX.maxLength);
      return one(
        plan && { key: at('add-max-length', pointer), title: `Add maxLength: ${UNBOUNDED_PARAMETER_FIX.maxLength}`, edits: plan.edits }
      );
    }
    if (schema.type === 'array' && schema.maxItems === undefined) {
      const plan = planInsertObjectMember(doc, schemaPointer, 'maxItems', UNBOUNDED_PARAMETER_FIX.maxItems);
      return one(
        plan && { key: at('add-max-items', pointer), title: `Add maxItems: ${UNBOUNDED_PARAMETER_FIX.maxItems}`, edits: plan.edits }
      );
    }
    return [];
  },

  'schema-unconstrained-additional-properties': (doc, diagnostic, analysis) => {
    const pointer = diagnostic.pointer;
    if (!pointer) return [];
    const schema = valueAt(analysis, pointer);
    if (!isRecord(schema)) return [];
    const edits = schema.additionalProperties === undefined
      ? planInsertObjectMember(doc, pointer, 'additionalProperties', false)?.edits
      : planSetScalarAtPointer(doc, `${pointer}/additionalProperties`, false);
    return one(
      edits && { key: at('set-additional-properties-false', pointer), title: 'Set additionalProperties: false', edits }
    );
  },

  'operation-missing-tags': (doc, diagnostic, analysis) => {
    const operation = operationFor(analysis, diagnostic.pointer);
    if (!operation) return [];
    const firstStatic = operation.path
      .split('/')
      .filter(Boolean)
      .find((segment) => classifyPathSegment(segment) === 'static');
    const tag = firstStatic ?? 'default';
    const object = valueAt(analysis, operation.pointer);
    const existing = isRecord(object) ? object.tags : undefined;
    // `tags: []` already present: append rather than re-insert the key.
    const plan = Array.isArray(existing)
      ? planInsertArrayItem(doc, `${operation.pointer}/tags`, tag)
      : planInsertObjectMember(doc, operation.pointer, 'tags', [tag]);
    return one(
      plan && { key: at('add-tag', operation.pointer), title: `Add tag "${tag}"`, edits: plan.edits }
    );
  },

  'operation-missing-operation-id': (doc, diagnostic, analysis) => {
    const operation = operationFor(analysis, diagnostic.pointer);
    if (!operation) return [];
    const existingIds = analysis.operations
      .map((candidate) => candidate.operationId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);
    const id = uniqueName(existingIds, deriveOperationId(operation.method, operation.path));
    const object = valueAt(analysis, operation.pointer);
    const current = isRecord(object) ? object.operationId : undefined;
    // An empty `operationId: ''` still trips the rule: overwrite it in place.
    const edits = typeof current === 'string'
      ? planSetScalarAtPointer(doc, `${operation.pointer}/operationId`, id)
      : planInsertObjectMember(doc, operation.pointer, 'operationId', id)?.edits;
    return one(
      edits && { key: at('add-operation-id', operation.pointer), title: `Add operationId "${id}"`, edits }
    );
  },

  // Derived placeholders for the two free-text rules: a real starting sentence
  // built from what the document already says, not "TODO". The planner appends
  // the new key after the operation's last member; valid, one undo, and the
  // user can move it up.
  'operation-missing-description': (doc, diagnostic, analysis) => {
    const operation = operationFor(analysis, diagnostic.pointer);
    if (!operation) return [];
    const object = valueAt(analysis, operation.pointer);
    if (!isRecord(object)) return [];
    const id = typeof object.operationId === 'string' && object.operationId.trim()
      ? object.operationId
      : deriveOperationId(operation.method, operation.path);
    const text = humanizeIdentifier(id);
    if (!text) return [];
    // A blank `summary: ''` still trips the rule: overwrite it in place.
    const edits = typeof object.summary === 'string'
      ? planSetScalarAtPointer(doc, `${operation.pointer}/summary`, text)
      : planInsertObjectMember(doc, operation.pointer, 'summary', text)?.edits;
    return one(edits && { key: at('add-summary', operation.pointer), title: `Add summary "${text}"`, edits });
  },

  'missing-info-description': (doc, diagnostic, analysis) => {
    const pointer = diagnostic.pointer ?? '/info';
    const info = valueAt(analysis, pointer);
    if (!isRecord(info)) return [];
    const title = typeof info.title === 'string' ? info.title.trim() : '';
    const text = !title
      ? 'API description.'
      : /\bapi$/i.test(title)
        ? `${title}.`
        : `${title} API.`;
    const edits = typeof info.description === 'string'
      ? planSetScalarAtPointer(doc, `${pointer}/description`, text)
      : planInsertObjectMember(doc, pointer, 'description', text)?.edits;
    return one(edits && { key: 'add-info-description', title: `Add info description "${text}"`, edits });
  },

  // Requires one of the document's existing schemes, on this operation or on
  // the whole document. Never offers `security: []` (public): that clears the
  // warning by declaring the endpoint unauthenticated, the opposite of the
  // rule's intent. With no schemes defined there is nothing to require.
  'operation-without-security': (doc, diagnostic, analysis) => {
    const operation = operationFor(analysis, diagnostic.pointer);
    const spec = specOf(analysis);
    if (!operation || !spec) return [];
    const schemes = securitySchemes(spec).map(([name]) => name);
    if (schemes.length === 0) return [];
    const object = valueAt(analysis, operation.pointer);
    const localIsArray = isRecord(object) && Array.isArray(object.security);
    const globalIsArray = Array.isArray(spec.security);
    const fixes: LintQuickFix[] = [];
    for (const name of schemes) {
      const requirement = { [name]: [] as string[] };
      // `security: []` already present (rule fires on empty): append an item
      // instead of re-inserting the key.
      const local = localIsArray
        ? planInsertArrayItem(doc, `${operation.pointer}/security`, requirement)
        : planInsertObjectMember(doc, operation.pointer, 'security', [requirement]);
      if (local) {
        fixes.push({
          key: at('require-security', `${operation.pointer}@${name}`),
          title: `Require "${name}" for this operation`,
          edits: local.edits,
        });
      }
    }
    for (const name of schemes) {
      const requirement = { [name]: [] as string[] };
      const global = globalIsArray
        ? planInsertArrayItem(doc, '/security', requirement)
        : planInsertObjectMember(doc, '', 'security', [requirement]);
      if (global) {
        fixes.push({
          key: at('require-global-security', name),
          title: `Require "${name}" for all operations`,
          edits: global.edits,
        });
      }
    }
    return fixes;
  },

  'api-key-in-query': (doc, diagnostic, analysis) => {
    const pointer = diagnostic.pointer;
    if (!pointer) return [];
    const scheme = valueAt(analysis, pointer);
    if (!isRecord(scheme) || scheme.in !== 'query') return [];
    const label = typeof scheme.name === 'string' && scheme.name ? scheme.name : pointer.split('/').pop();
    const edits = planSetScalarAtPointer(doc, `${pointer}/in`, 'header');
    return one(
      edits && { key: at('api-key-to-header', pointer), title: `Move API key "${label}" to header`, edits }
    );
  },

  'server-uses-http': (doc, diagnostic, analysis) =>
    rewriteServerUrl(doc, diagnostic, analysis, 'server-https', 'Use https://', (url) =>
      url.replace(/^http:\/\//i, 'https://')
    ),

  'server-url-has-credentials': (doc, diagnostic, analysis) =>
    rewriteServerUrl(
      doc, diagnostic, analysis, 'server-strip-credentials', 'Remove credentials from server URL',
      // Drop the userinfo between the scheme and the host: scheme://user[:pass]@host
      (url) => url.replace(/^([a-z][a-z0-9+.-]*:\/\/)[^/@\s]+@/i, '$1')
    ),

  // Adds the conventional X-RateLimit-* trio to every inline 2xx response of
  // the operation that lacks a rate-limit header. `$ref` responses are shared
  // components and are left alone.
  'rate-limit-headers': (doc, diagnostic, analysis) => {
    const pointer = diagnostic.pointer;
    if (!pointer) return [];
    const responses = valueAt(analysis, pointer);
    if (!isRecord(responses)) return [];
    const edits: SpecTextEdit[] = [];
    for (const code of Object.keys(responses)) {
      if (!code.startsWith('2')) continue;
      const response = responses[code];
      if (!isRecord(response) || isRefNode(response)) continue;
      const responsePointer = `${pointer}/${code}`;
      const headers = response.headers;
      if (!isRecord(headers)) {
        const plan = planInsertObjectMember(doc, responsePointer, 'headers', RATE_LIMIT_HEADERS);
        if (plan) edits.push(...plan.edits);
        continue;
      }
      if (Object.keys(headers).some((name) => /^(x-)?ratelimit/i.test(name))) continue;
      // Each insert anchors after the same last existing header. Hosts apply
      // same-position insertions right-to-left in array order, so emit in
      // reverse to read Limit / Remaining / Reset once applied.
      for (const name of Object.keys(RATE_LIMIT_HEADERS).reverse()) {
        const plan = planInsertObjectMember(doc, `${responsePointer}/headers`, name, RATE_LIMIT_HEADERS[name]);
        if (plan) edits.push(...plan.edits);
      }
    }
    return edits.length
      ? [{ key: at('add-rate-limit-headers', pointer), title: 'Add rate-limit headers to 2xx responses', edits }]
      : [];
  },

  'unused-component-schema': (doc, diagnostic) => {
    const pointer = diagnostic.pointer;
    if (!pointer) return [];
    const name = pointer.split('/').pop() ?? '';
    const edits = planDeleteAtPointer(doc, pointer);
    return one(
      edits && { key: at('remove-unused-schema', pointer), title: `Remove unused schema "${name}"`, edits }
    );
  },

  // Declares the tag at the root so documentation renderers group by it. The
  // fix key is per tag name, so several operations sharing an undeclared tag
  // surface one action.
  'operation-tag-undefined': (doc, diagnostic, analysis) => {
    const pointer = diagnostic.pointer;
    if (!pointer) return [];
    const tag = valueAt(analysis, pointer);
    if (typeof tag !== 'string' || !tag) return [];
    const spec = specOf(analysis);
    const plan = spec && Array.isArray(spec.tags)
      ? planInsertArrayItem(doc, '/tags', { name: tag })
      : planInsertObjectMember(doc, '', 'tags', [{ name: tag }]);
    return one(plan && { key: at('declare-tag', tag), title: `Declare tag "${tag}" in root tags`, edits: plan.edits });
  },

  'tag-duplicate-name': (doc, diagnostic, analysis) => {
    const pointer = diagnostic.pointer;
    if (!pointer) return [];
    const tag = valueAt(analysis, pointer);
    const name = isRecord(tag) && typeof tag.name === 'string' ? tag.name : '';
    const edits = planDeleteAtPointer(doc, pointer);
    return one(edits && { key: at('remove-duplicate-tag', pointer), title: `Remove duplicate tag "${name}"`, edits });
  },

  'tag-missing-description': (doc, diagnostic, analysis) => {
    const pointer = diagnostic.pointer;
    if (!pointer) return [];
    const tag = valueAt(analysis, pointer);
    if (!isRecord(tag) || typeof tag.name !== 'string') return [];
    const text = `${humanizeIdentifier(tag.name) || tag.name} operations.`;
    const edits = typeof tag.description === 'string'
      ? planSetScalarAtPointer(doc, `${pointer}/description`, text)
      : planInsertObjectMember(doc, pointer, 'description', text)?.edits;
    return one(edits && { key: at('add-tag-description', pointer), title: `Add description "${text}"`, edits });
  },

  'info-missing-contact': (doc, diagnostic, analysis) => {
    const pointer = diagnostic.pointer ?? '/info';
    const info = valueAt(analysis, pointer);
    if (!isRecord(info) || info.contact !== undefined) return [];
    const plan = planInsertObjectMember(doc, pointer, 'contact', { name: 'API Support' });
    return one(plan && { key: 'add-info-contact', title: 'Add info.contact', edits: plan.edits });
  },

  'info-missing-license': (doc, diagnostic, analysis) => {
    const pointer = diagnostic.pointer ?? '/info';
    const info = valueAt(analysis, pointer);
    if (!isRecord(info) || info.license !== undefined) return [];
    const plan = planInsertObjectMember(doc, pointer, 'license', {
      name: 'Apache 2.0',
      url: 'https://www.apache.org/licenses/LICENSE-2.0.html',
    });
    return one(plan && { key: 'add-info-license', title: 'Add info.license (Apache 2.0)', edits: plan.edits });
  },

  'operation-duplicate-parameter': (doc, diagnostic, analysis) => {
    const pointer = diagnostic.pointer;
    if (!pointer) return [];
    const param = valueAt(analysis, pointer);
    const name = isRecord(param) && typeof param.name === 'string' ? param.name : '';
    const edits = planDeleteAtPointer(doc, pointer);
    return one(
      edits && { key: at('remove-duplicate-parameter', pointer), title: `Remove duplicate parameter "${name}"`, edits }
    );
  },

  'path-key-trailing-slash': (doc, diagnostic) => {
    const pointer = diagnostic.pointer;
    if (!pointer) return [];
    const key = unescapeLastSegment(pointer);
    const renamed = key.replace(/\/+$/, '') || '/';
    if (renamed === key) return [];
    const plan = planRenameObjectKey(doc, pointer, renamed);
    return one(plan && { key: at('strip-trailing-slash', pointer), title: `Rename path to "${renamed}"`, edits: plan.edits });
  },

  'path-key-has-query': (doc, diagnostic) => {
    const pointer = diagnostic.pointer;
    if (!pointer) return [];
    const key = unescapeLastSegment(pointer);
    const renamed = key.slice(0, key.indexOf('?')) || '/';
    const plan = planRenameObjectKey(doc, pointer, renamed);
    return one(plan && { key: at('strip-path-query', pointer), title: `Rename path to "${renamed}"`, edits: plan.edits });
  },

  'server-url-trailing-slash': (doc, diagnostic, analysis) =>
    rewriteServerUrl(doc, diagnostic, analysis, 'server-strip-trailing-slash', 'Remove trailing slash', (url) =>
      url.replace(/\/+$/, '')
    ),

  'servers-empty': (doc, _diagnostic, analysis) => {
    const spec = specOf(analysis);
    if (!spec) return [];
    const server = { url: 'https://api.example.com' };
    const plan = Array.isArray(spec.servers)
      ? planInsertArrayItem(doc, '/servers', server)
      : planInsertObjectMember(doc, '', 'servers', [server]);
    return one(plan && { key: 'add-server', title: 'Add a server entry', edits: plan.edits });
  },

  // One fix per missing variable; the pointer is the server's `url`.
  'server-variable-undefined': (doc, diagnostic, analysis) => {
    const pointer = diagnostic.pointer;
    if (!pointer || !pointer.endsWith('/url')) return [];
    const serverPointer = pointer.slice(0, -'/url'.length);
    const server = valueAt(analysis, serverPointer);
    if (!isRecord(server) || typeof server.url !== 'string') return [];
    const declared = isRecord(server.variables) ? server.variables : undefined;
    const fixes: LintQuickFix[] = [];
    const seen = new Set<string>();
    for (const match of server.url.matchAll(/\{([^{}]+)\}/g)) {
      const name = match[1];
      if (seen.has(name) || (declared && name in declared)) continue;
      seen.add(name);
      const plan = declared
        ? planInsertObjectMember(doc, `${serverPointer}/variables`, name, { default: '' })
        : planInsertObjectMember(doc, serverPointer, 'variables', { [name]: { default: '' } });
      if (plan) {
        fixes.push({
          key: at('add-server-variable', `${serverPointer}@${name}`),
          title: `Declare server variable "${name}"`,
          edits: plan.edits,
        });
      }
      // Without an existing `variables` map only the first insert is valid in
      // one batch (the second would re-create the key); offer it alone.
      if (!declared) break;
    }
    return fixes;
  },
};

/** The last pointer segment, RFC 6901 unescaped (a `paths` key). */
function unescapeLastSegment(pointer: string): string {
  const raw = pointer.split('/').pop() ?? '';
  return raw.replace(/~1/g, '/').replace(/~0/g, '~');
}

/** Lint rule ids that have a quick fix. */
export const LINT_FIXABLE_CODES: ReadonlySet<string> = new Set(Object.keys(LINT_FIX_BUILDERS));

/**
 * Plans the quick fixes for a lint diagnostic: none when the rule has no fix
 * or the edit cannot be applied safely (the planners refuse flow-style YAML
 * collections and missing targets), several when there is a choice (one per
 * security scheme). Host-agnostic: VS Code wraps the edits in a
 * WorkspaceEdit, the desktop hands them to Monaco.
 */
export function planLintQuickFixes(
  doc: SpecDocument,
  diagnostic: OpenApiDiagnostic,
  analysis: OpenApiAnalysis
): LintQuickFix[] {
  if (diagnostic.source !== 'lint' || diagnostic.code === undefined) return [];
  const builder = LINT_FIX_BUILDERS[diagnostic.code];
  if (!builder || !analysis.parsedSpec) return [];
  return builder(doc, diagnostic, analysis);
}
