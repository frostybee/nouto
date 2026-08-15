/**
 * Operation-node builders for the outline tree: the operation entry itself and
 * the drill-in detail subtree (parameters, request body, responses, callbacks,
 * security, servers, tags). Parameterized by the tree builder's node factory
 * so created nodes register in the same pointer index.
 */
import { buildPointer } from '../pointer';
import type { OpenApiOperationSummary } from '../types';
import { asRecord, METHOD_COLORS } from './model';
import type { NodeFactory, OutlineNode } from './model';

export function makeOperationNode(node: NodeFactory) {
  return (parent: OutlineNode, operation: OpenApiOperationSummary): OutlineNode => {
    const created = node(parent, operation.pointer, {
      label: `${operation.method.toUpperCase()} ${operation.path}`,
      description: operation.summary ?? operation.operationId,
      iconId: 'circle-filled',
      iconColor: METHOD_COLORS[operation.method.toLowerCase()],
      contextValue: 'outlineOperation',
      pointer: operation.pointer,
    });
    created.operation = { path: operation.path, method: operation.method };
    return created;
  };
}

/**
 * Label for one entry of an operation's `parameters` array. Inline parameters
 * show their name and location (`page` · query); `$ref` entries are not
 * resolved here, so they fall back to the target's final pointer segment,
 * which for the conventional `#/components/parameters/Page` reads correctly.
 */
function parameterEntry(raw: unknown, index: number): { label: string; description?: string } {
  const parameter = asRecord(raw);
  if (typeof parameter?.name === 'string' && parameter.name) {
    return {
      label: parameter.name,
      description: typeof parameter.in === 'string' ? parameter.in : undefined,
    };
  }
  const ref = typeof parameter?.$ref === 'string' ? parameter.$ref : undefined;
  if (ref) return { label: ref.split('/').pop() || ref, description: '$ref' };
  return { label: `Parameter ${index + 1}` };
}

/**
 * Nests an operation's own surface — parameters, request body, responses,
 * callbacks, security, servers, tags — beneath its node, so the outline can
 * be drilled into rather than dead-ending at the operation.
 *
 * Only applied where an operation is a genuine document location (Paths and
 * Webhooks). Tags and Operation ID are flat indexes over those same
 * operations, so repeating the subtree there would triple it for no
 * navigational gain. Children stay in document order regardless of the sort
 * toggle — response codes and parameter order carry meaning, and the toggle's
 * contract covers only the top-level groups.
 */
export function makeAddOperationDetail(node: NodeFactory) {
  return (
    parent: OutlineNode,
    operation: Record<string, unknown>,
    basePointer: string
  ): void => {
    const section = (key: string, iconId: string): OutlineNode =>
      node(parent, key, {
        label: key,
        iconId,
        contextValue: 'outlineOperationSection',
        pointer: basePointer + buildPointer([key]),
      });
    const entry = (
      group: OutlineNode,
      key: string,
      childKey: string,
      props: { label: string; description?: string; iconId: string }
    ): void => {
      node(group, childKey, {
        ...props,
        contextValue: 'outlineOperationItem',
        pointer: basePointer + buildPointer([key, childKey]),
      });
    };

    const parameters = Array.isArray(operation.parameters) ? operation.parameters : [];
    if (parameters.length) {
      const group = section('parameters', 'symbol-parameter');
      parameters.forEach((raw, index) => {
        entry(group, 'parameters', String(index), {
          ...parameterEntry(raw, index),
          iconId: 'symbol-variable',
        });
      });
    }

    // A request body has no meaningful children to list, so it stays a leaf.
    if (asRecord(operation.requestBody)) section('requestBody', 'symbol-object');

    const responses = asRecord(operation.responses);
    if (responses) {
      const group = section('responses', 'reply');
      for (const code of Object.keys(responses)) {
        const description = asRecord(responses[code])?.description;
        entry(group, 'responses', code, {
          label: code,
          description: typeof description === 'string' ? description : undefined,
          iconId: 'symbol-numeric',
        });
      }
    }

    const callbacks = asRecord(operation.callbacks);
    if (callbacks && Object.keys(callbacks).length) {
      const group = section('callbacks', 'symbol-event');
      for (const name of Object.keys(callbacks)) {
        entry(group, 'callbacks', name, { label: name, iconId: 'symbol-event' });
      }
    }

    // Mirrors the root Security/Servers/Tags label conventions so the same
    // concept reads identically wherever it appears in the tree.
    const security = Array.isArray(operation.security) ? operation.security : [];
    if (security.length) {
      const group = section('security', 'shield');
      security.forEach((raw, index) => {
        const names = Object.keys(asRecord(raw) ?? {});
        entry(group, 'security', String(index), {
          label: names.length ? names.join(' + ') : 'None (optional)',
          iconId: 'key',
        });
      });
    }

    const servers = Array.isArray(operation.servers) ? operation.servers : [];
    if (servers.length) {
      const group = section('servers', 'server-environment');
      servers.forEach((raw, index) => {
        const server = asRecord(raw);
        entry(group, 'servers', String(index), {
          label: typeof server?.url === 'string' && server.url ? server.url : `Server ${index + 1}`,
          description: typeof server?.description === 'string' ? server.description : undefined,
          iconId: 'server',
        });
      });
    }

    const tags = Array.isArray(operation.tags)
      ? operation.tags.filter((tag): tag is string => typeof tag === 'string')
      : [];
    if (tags.length) {
      const group = section('tags', 'tags');
      tags.forEach((tag, index) => {
        entry(group, 'tags', String(index), { label: tag, iconId: 'tag' });
      });
    }
  };
}
