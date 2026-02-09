import { autocompletion, type CompletionContext, type CompletionResult, type Completion } from '@codemirror/autocomplete';
import type { Extension } from '@codemirror/state';

const hfCompletions: Completion[] = [
  // hf.request.*
  { label: 'hf.request', type: 'variable', detail: 'Request object', info: 'Access request URL, method, headers, body' },
  { label: 'hf.request.url', type: 'property', detail: 'string', info: 'Request URL (read/write)' },
  { label: 'hf.request.method', type: 'property', detail: 'string', info: 'HTTP method (read/write)' },
  { label: 'hf.request.headers', type: 'property', detail: 'object', info: 'Request headers object' },
  { label: 'hf.request.body', type: 'property', detail: 'any', info: 'Request body (read/write)' },
  { label: 'hf.request.setHeader', type: 'method', detail: '(name, value)', info: 'Set a request header', apply: "hf.request.setHeader('${name}', '${value}')" },
  { label: 'hf.request.removeHeader', type: 'method', detail: '(name)', info: 'Remove a request header', apply: "hf.request.removeHeader('${name}')" },

  // hf.response.*
  { label: 'hf.response', type: 'variable', detail: 'Response object', info: 'Access response data (post-response only)' },
  { label: 'hf.response.status', type: 'property', detail: 'number', info: 'HTTP status code' },
  { label: 'hf.response.statusText', type: 'property', detail: 'string', info: 'HTTP status text' },
  { label: 'hf.response.headers', type: 'property', detail: 'object', info: 'Response headers object' },
  { label: 'hf.response.body', type: 'property', detail: 'any', info: 'Response body (raw)' },
  { label: 'hf.response.duration', type: 'property', detail: 'number', info: 'Response time in ms' },
  { label: 'hf.response.json', type: 'method', detail: '()', info: 'Parse response body as JSON', apply: 'hf.response.json()' },
  { label: 'hf.response.text', type: 'method', detail: '()', info: 'Get response body as text', apply: 'hf.response.text()' },

  // hf.getVar / hf.setVar
  { label: 'hf.getVar', type: 'function', detail: '(name)', info: 'Get an environment variable value', apply: "hf.getVar('${name}')" },
  { label: 'hf.setVar', type: 'function', detail: '(name, value, scope?)', info: 'Set an environment variable', apply: "hf.setVar('${name}', '${value}')" },

  // hf.test
  { label: 'hf.test', type: 'function', detail: '(name, fn)', info: 'Define a test assertion', apply: "hf.test('${name}', () => {\n  \n})" },

  // hf.uuid
  { label: 'hf.uuid', type: 'function', detail: '()', info: 'Generate a UUID v4', apply: 'hf.uuid()' },

  // hf.hash.*
  { label: 'hf.hash.md5', type: 'function', detail: '(str)', info: 'MD5 hash a string', apply: "hf.hash.md5('${input}')" },
  { label: 'hf.hash.sha256', type: 'function', detail: '(str)', info: 'SHA-256 hash a string', apply: "hf.hash.sha256('${input}')" },

  // hf.base64.*
  { label: 'hf.base64.encode', type: 'function', detail: '(str)', info: 'Base64 encode a string', apply: "hf.base64.encode('${input}')" },
  { label: 'hf.base64.decode', type: 'function', detail: '(str)', info: 'Base64 decode a string', apply: "hf.base64.decode('${input}')" },

  // hf.setNextRequest
  { label: 'hf.setNextRequest', type: 'function', detail: '(nameOrId)', info: 'Set the next request to execute in a collection run', apply: "hf.setNextRequest('${requestName}')" },
];

function hfCompletionSource(context: CompletionContext): CompletionResult | null {
  // Match `hf` followed by optional `.something` chains
  const match = context.matchBefore(/hf(\.\w*)*\.?\w*/);
  if (!match || match.from === match.to && !context.explicit) return null;

  const prefix = match.text;

  // Filter completions that start with the current prefix
  const options = hfCompletions.filter(c => c.label.startsWith(prefix) || prefix.startsWith(c.label.split('.').slice(0, -1).join('.')));

  if (options.length === 0) return null;

  return {
    from: match.from,
    options,
    validFor: /^[\w.]*$/,
  };
}

export function hfAutocomplete(): Extension {
  return autocompletion({
    override: [hfCompletionSource],
    activateOnTyping: true,
    maxRenderedOptions: 30,
  });
}
