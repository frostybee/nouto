import { buildPointer, escapePointerSegment } from '../../pointer';
import { isRefNode } from '../../refs';
import { OPENAPI_OPERATION_METHODS, getAdditionalOperations } from '../../types';
import type { OpenApiAnalysis } from '../../types';
import type { LintFinding, LintRule } from '../types';
import {
  COMPONENT_KINDS,
  componentEntries,
  isRecord,
  operationViews,
  securitySchemes,
  specOf,
  versionAtLeast,
} from '../context';
import type { ComponentKind } from '../context';

/**
 * Reference Object, component, and security-requirement integrity rules.
 */

/** Operations of an inline path item, with pointers. */
function operationsOf(pathItem: Record<string, unknown>, pointer: string) {
  const entries: Array<{ operation: Record<string, unknown>; pointer: string }> = [];
  for (const method of OPENAPI_OPERATION_METHODS) {
    const operation = pathItem[method];
    if (isRecord(operation)) entries.push({ operation, pointer: `${pointer}/${method}` });
  }
  const additional = getAdditionalOperations(pathItem);
  if (additional) {
    for (const [method, operation] of Object.entries(additional)) {
      if (isRecord(operation)) {
        entries.push({ operation, pointer: `${pointer}/additionalOperations/${escapePointerSegment(method)}` });
      }
    }
  }
  return entries;
}

/** Sibling keys next to `$ref` that are legal in 3.1+ Reference Objects. */
const ALLOWED_REF_SIBLINGS = new Set(['$ref', 'summary', 'description']);

const refHasSiblings: LintRule = {
  id: 'ref-has-siblings',
  description: 'Keys next to $ref are ignored (OpenAPI 3.0) or limited to summary/description (3.1+).',
  defaultSeverity: 'warning',
  run(analysis) {
    const spec = specOf(analysis);
    if (!spec) return [];
    const modern = versionAtLeast(analysis, '3.1');
    const findings: LintFinding[] = [];
    const report = (node: Record<string, unknown>, pointer: string) => {
      const extras = Object.keys(node).filter((key) => (modern ? !ALLOWED_REF_SIBLINGS.has(key) : key !== '$ref'));
      if (extras.length === 0) return;
      findings.push({
        message: modern
          ? `Reference Object has keys besides $ref/summary/description (${extras.join(', ')}); they are ignored.`
          : `Keys next to $ref (${extras.join(', ')}) are ignored in OpenAPI 3.0.`,
        pointer,
        anchor: true,
      });
    };

    if (!modern) {
      // 3.0: a `$ref` anywhere (Schema Objects included) must stand alone.
      const visit = (node: unknown, pointer: string): void => {
        if (Array.isArray(node)) {
          node.forEach((item, index) => visit(item, `${pointer}/${index}`));
          return;
        }
        if (!isRecord(node)) return;
        if (isRefNode(node)) {
          report(node, pointer);
          return;
        }
        for (const [key, value] of Object.entries(node)) visit(value, `${pointer}/${escapePointerSegment(key)}`);
      };
      visit(spec, '');
      return findings;
    }

    // 3.1+: Schema Objects follow JSON Schema, where $ref siblings are valid,
    // so only the spec's Reference Object sites are checked.
    const check = (node: unknown, pointer: string) => {
      if (isRecord(node) && isRefNode(node)) report(node, pointer);
    };
    const checkMap = (map: unknown, pointer: string) => {
      if (!isRecord(map)) return;
      for (const [key, value] of Object.entries(map)) check(value, `${pointer}/${escapePointerSegment(key)}`);
    };
    const checkList = (list: unknown, pointer: string) => {
      if (!Array.isArray(list)) return;
      list.forEach((item, index) => check(item, `${pointer}/${index}`));
    };
    const checkMediaTypes = (container: unknown, pointer: string) => {
      if (!isRecord(container) || isRefNode(container) || !isRecord(container.content)) return;
      for (const [type, media] of Object.entries(container.content)) {
        if (isRecord(media)) checkMap(media.examples, `${pointer}/content/${escapePointerSegment(type)}/examples`);
      }
    };
    const checkPathItem = (pathItem: unknown, pointer: string) => {
      check(pathItem, pointer);
      if (!isRecord(pathItem) || isRefNode(pathItem)) return;
      checkList(pathItem.parameters, `${pointer}/parameters`);
      for (const { operation, pointer: opPointer } of operationsOf(pathItem, pointer)) {
        checkList(operation.parameters, `${opPointer}/parameters`);
        check(operation.requestBody, `${opPointer}/requestBody`);
        checkMediaTypes(operation.requestBody, `${opPointer}/requestBody`);
        if (isRecord(operation.responses)) {
          for (const [code, response] of Object.entries(operation.responses)) {
            const responsePointer = `${opPointer}/responses/${escapePointerSegment(code)}`;
            check(response, responsePointer);
            if (isRecord(response) && !isRefNode(response)) {
              checkMap(response.headers, `${responsePointer}/headers`);
              checkMap(response.links, `${responsePointer}/links`);
              checkMediaTypes(response, responsePointer);
            }
          }
        }
        checkMap(operation.callbacks, `${opPointer}/callbacks`);
      }
    };
    for (const section of ['paths', 'webhooks'] as const) {
      if (!isRecord(spec[section])) continue;
      for (const [key, pathItem] of Object.entries(spec[section] as Record<string, unknown>)) {
        checkPathItem(pathItem, buildPointer([section, key]));
      }
    }
    for (const kind of ['responses', 'parameters', 'examples', 'requestBodies', 'headers', 'links', 'callbacks', 'pathItems'] as const) {
      const components = isRecord(spec.components) ? spec.components : undefined;
      if (components) checkMap(components[kind], `/components/${kind}`);
    }
    return findings;
  },
};

const exampleValueAndExternalValue: LintRule = {
  id: 'example-value-and-external-value',
  description: 'An Example Object sets both value and externalValue; they are mutually exclusive.',
  defaultSeverity: 'error',
  run(analysis) {
    const spec = specOf(analysis);
    if (!spec) return [];
    const findings: LintFinding[] = [];
    const visit = (node: unknown, pointer: string): void => {
      if (Array.isArray(node)) {
        node.forEach((item, index) => visit(item, `${pointer}/${index}`));
        return;
      }
      if (!isRecord(node)) return;
      for (const [key, value] of Object.entries(node)) {
        const childPointer = `${pointer}/${escapePointerSegment(key)}`;
        if (key === 'examples' && isRecord(value)) {
          for (const [name, example] of Object.entries(value)) {
            if (isRecord(example) && 'value' in example && 'externalValue' in example) {
              findings.push({
                message: `Example "${name}" sets both value and externalValue.`,
                pointer: `${childPointer}/${escapePointerSegment(name)}`,
                anchor: true,
              });
            }
          }
        }
        visit(value, childPointer);
      }
    };
    visit(spec, '');
    return findings;
  },
};

const COMPONENT_KEY = /^[a-zA-Z0-9.\-_]+$/;

const componentKeyInvalid: LintRule = {
  id: 'component-key-invalid',
  description: 'Component keys must match ^[a-zA-Z0-9.-_]+$.',
  defaultSeverity: 'error',
  run(analysis) {
    const spec = specOf(analysis);
    if (!spec || !isRecord(spec.components)) return [];
    const findings: LintFinding[] = [];
    for (const kind of COMPONENT_KINDS) {
      const section = spec.components[kind];
      if (!isRecord(section)) continue;
      for (const name of Object.keys(section)) {
        if (COMPONENT_KEY.test(name)) continue;
        findings.push({
          message: `Component key "${name}" under ${kind} contains characters outside [a-zA-Z0-9.-_].`,
          pointer: buildPointer(['components', kind, name]),
          anchor: true,
        });
      }
    }
    return findings;
  },
};

/** True when the document has operations that could reference components. */
export function hasOperationsSection(spec: Record<string, unknown>): boolean {
  return isRecord(spec.paths) || isRecord(spec.webhooks);
}

/** Security scheme names required anywhere in the document. */
function requiredSchemeNames(analysis: OpenApiAnalysis): Set<string> {
  const spec = specOf(analysis);
  const names = new Set<string>();
  const collect = (security: unknown) => {
    if (!Array.isArray(security)) return;
    for (const requirement of security) {
      if (isRecord(requirement)) Object.keys(requirement).forEach((name) => names.add(name));
    }
  };
  if (spec) collect(spec.security);
  for (const { object } of operationViews(analysis)) collect(object.security);
  return names;
}

const UNUSED_KINDS: ComponentKind[] = ['parameters', 'responses', 'requestBodies', 'headers', 'examples', 'links', 'callbacks', 'pathItems'];

const unusedComponent: LintRule = {
  id: 'unused-component',
  description: 'A component (parameter, response, request body, header, example, link, callback, path item, or security scheme) is never used.',
  defaultSeverity: 'warning',
  run(analysis) {
    const spec = specOf(analysis);
    // A components-only document exists to be referenced from elsewhere.
    if (!spec || !hasOperationsSection(spec)) return [];
    const usedRefs = new Set(analysis.resolvedRefs.keys());
    const findings: LintFinding[] = [];
    for (const kind of UNUSED_KINDS) {
      for (const { name, pointer } of componentEntries(spec, kind)) {
        if (usedRefs.has(`#/components/${kind}/${escapePointerSegment(name)}`)) continue;
        findings.push({ message: `Component ${kind} entry "${name}" is never referenced.`, pointer, anchor: true });
      }
    }
    const required = requiredSchemeNames(analysis);
    for (const [name] of securitySchemes(spec)) {
      if (required.has(name)) continue;
      findings.push({
        message: `Security scheme "${name}" is never required by any security requirement.`,
        pointer: buildPointer(['components', 'securitySchemes', name]),
        anchor: true,
      });
    }
    return findings;
  },
};

const securitySchemeUndefined: LintRule = {
  id: 'security-scheme-undefined',
  description: 'A security requirement names a scheme that components.securitySchemes does not define.',
  defaultSeverity: 'error',
  run(analysis) {
    const spec = specOf(analysis);
    if (!spec) return [];
    const defined = new Set(securitySchemes(spec).map(([name]) => name));
    const findings: LintFinding[] = [];
    const check = (security: unknown, pointer: string) => {
      if (!Array.isArray(security)) return;
      security.forEach((requirement, index) => {
        if (!isRecord(requirement)) return;
        for (const name of Object.keys(requirement)) {
          if (defined.has(name)) continue;
          findings.push({
            message: `Security requirement references undefined scheme "${name}".`,
            pointer: `${pointer}/${index}/${escapePointerSegment(name)}`,
          });
        }
      });
    };
    check(spec.security, '/security');
    for (const { summary, object } of operationViews(analysis)) check(object.security, `${summary.pointer}/security`);
    return findings;
  },
};

/** Scopes declared across all flows of an oauth2 scheme. */
function declaredScopes(scheme: Record<string, unknown>): Set<string> | undefined {
  if (scheme.type !== 'oauth2' || !isRecord(scheme.flows)) return undefined;
  const scopes = new Set<string>();
  for (const flow of Object.values(scheme.flows)) {
    if (isRecord(flow) && isRecord(flow.scopes)) Object.keys(flow.scopes).forEach((scope) => scopes.add(scope));
  }
  return scopes;
}

const securityScopeUndefined: LintRule = {
  id: 'security-scope-undefined',
  description: 'A security requirement lists an OAuth2 scope that the scheme does not declare in any flow.',
  defaultSeverity: 'error',
  run(analysis) {
    const spec = specOf(analysis);
    if (!spec) return [];
    const schemes = new Map(securitySchemes(spec));
    const findings: LintFinding[] = [];
    const check = (security: unknown, pointer: string) => {
      if (!Array.isArray(security)) return;
      security.forEach((requirement, index) => {
        if (!isRecord(requirement)) return;
        for (const [name, scopes] of Object.entries(requirement)) {
          const scheme = schemes.get(name);
          if (!scheme || !Array.isArray(scopes)) continue;
          const declared = declaredScopes(scheme);
          if (!declared) continue;
          scopes.forEach((scope, scopeIndex) => {
            if (typeof scope !== 'string' || declared.has(scope)) return;
            findings.push({
              message: `Scope "${scope}" is not declared by security scheme "${name}".`,
              pointer: `${pointer}/${index}/${escapePointerSegment(name)}/${scopeIndex}`,
            });
          });
        }
      });
    };
    check(spec.security, '/security');
    for (const { summary, object } of operationViews(analysis)) check(object.security, `${summary.pointer}/security`);
    return findings;
  },
};

/** Callback path items of every operation under `paths` and `webhooks`. */
function callbackPathItems(spec: Record<string, unknown>) {
  const items: Array<{ pathItem: Record<string, unknown>; pointer: string }> = [];
  for (const section of ['paths', 'webhooks'] as const) {
    if (!isRecord(spec[section])) continue;
    for (const [key, pathItem] of Object.entries(spec[section] as Record<string, unknown>)) {
      if (!isRecord(pathItem)) continue;
      for (const { operation, pointer } of operationsOf(pathItem, buildPointer([section, key]))) {
        if (!isRecord(operation.callbacks)) continue;
        for (const [name, callback] of Object.entries(operation.callbacks)) {
          if (!isRecord(callback) || isRefNode(callback)) continue;
          for (const [expression, item] of Object.entries(callback)) {
            if (isRecord(item)) {
              items.push({
                pathItem: item,
                pointer: `${pointer}/callbacks/${escapePointerSegment(name)}/${escapePointerSegment(expression)}`,
              });
            }
          }
        }
      }
    }
  }
  return items;
}

const callbackNested: LintRule = {
  id: 'callback-nested',
  description: 'A callback operation defines its own callbacks; nested callbacks are not supported by tooling.',
  defaultSeverity: 'warning',
  run(analysis) {
    const spec = specOf(analysis);
    if (!spec) return [];
    const findings: LintFinding[] = [];
    for (const { pathItem, pointer } of callbackPathItems(spec)) {
      for (const { operation, pointer: opPointer } of operationsOf(pathItem, pointer)) {
        if (isRecord(operation.callbacks)) {
          findings.push({ message: 'Callbacks must not be nested inside a callback operation.', pointer: `${opPointer}/callbacks`, anchor: true });
        }
      }
    }
    return findings;
  },
};

const webhookHasServers: LintRule = {
  id: 'webhook-has-servers',
  description: 'A webhook declares servers; webhooks are called by the API, so servers do not apply.',
  defaultSeverity: 'warning',
  run(analysis) {
    const spec = specOf(analysis);
    if (!spec || !isRecord(spec.webhooks)) return [];
    const findings: LintFinding[] = [];
    for (const [key, pathItem] of Object.entries(spec.webhooks)) {
      if (!isRecord(pathItem)) continue;
      const pointer = buildPointer(['webhooks', key]);
      if (pathItem.servers !== undefined) {
        findings.push({ message: `Webhook "${key}" declares servers.`, pointer: `${pointer}/servers`, anchor: true });
      }
      for (const { operation, pointer: opPointer } of operationsOf(pathItem, pointer)) {
        if (operation.servers !== undefined) {
          findings.push({ message: `Webhook "${key}" operation declares servers.`, pointer: `${opPointer}/servers`, anchor: true });
        }
      }
    }
    return findings;
  },
};

const webhookHasCallbacks: LintRule = {
  id: 'webhook-has-callbacks',
  description: 'A webhook operation declares callbacks; callbacks belong to regular operations.',
  defaultSeverity: 'warning',
  run(analysis) {
    const spec = specOf(analysis);
    if (!spec || !isRecord(spec.webhooks)) return [];
    const findings: LintFinding[] = [];
    for (const [key, pathItem] of Object.entries(spec.webhooks)) {
      if (!isRecord(pathItem)) continue;
      for (const { operation, pointer: opPointer } of operationsOf(pathItem, buildPointer(['webhooks', key]))) {
        if (operation.callbacks !== undefined) {
          findings.push({ message: `Webhook "${key}" operation declares callbacks.`, pointer: `${opPointer}/callbacks`, anchor: true });
        }
      }
    }
    return findings;
  },
};

export const componentRules: LintRule[] = [
  refHasSiblings,
  exampleValueAndExternalValue,
  componentKeyInvalid,
  unusedComponent,
  securitySchemeUndefined,
  securityScopeUndefined,
  callbackNested,
  webhookHasServers,
  webhookHasCallbacks,
];
