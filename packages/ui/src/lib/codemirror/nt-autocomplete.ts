import { autocompletion, type CompletionContext, type CompletionResult, type Completion } from '@codemirror/autocomplete';
import type { Extension } from '@codemirror/state';

const ntCompletions: Completion[] = [
  // nt.request.*
  { label: 'nt.request', type: 'variable', detail: 'Request object', info: 'Access request URL, method, headers, body' },
  { label: 'nt.request.url', type: 'property', detail: 'string', info: 'Request URL (read/write)' },
  { label: 'nt.request.method', type: 'property', detail: 'string', info: 'HTTP method (read/write)' },
  { label: 'nt.request.headers', type: 'property', detail: 'object', info: 'Request headers object' },
  { label: 'nt.request.body', type: 'property', detail: 'any', info: 'Request body (read/write)' },
  { label: 'nt.request.setHeader', type: 'method', detail: '(name, value)', info: 'Set a request header', apply: "nt.request.setHeader('${name}', '${value}')" },
  { label: 'nt.request.removeHeader', type: 'method', detail: '(name)', info: 'Remove a request header', apply: "nt.request.removeHeader('${name}')" },

  // nt.response.*
  { label: 'nt.response', type: 'variable', detail: 'Response object', info: 'Access response data (post-response only)' },
  { label: 'nt.response.status', type: 'property', detail: 'number', info: 'HTTP status code' },
  { label: 'nt.response.statusText', type: 'property', detail: 'string', info: 'HTTP status text' },
  { label: 'nt.response.headers', type: 'property', detail: 'object', info: 'Response headers object' },
  { label: 'nt.response.body', type: 'property', detail: 'any', info: 'Response body (raw)' },
  { label: 'nt.response.duration', type: 'property', detail: 'number', info: 'Response time in ms' },
  { label: 'nt.response.json', type: 'method', detail: '()', info: 'Parse response body as JSON', apply: 'nt.response.json()' },
  { label: 'nt.response.text', type: 'method', detail: '()', info: 'Get response body as text', apply: 'nt.response.text()' },
  { label: 'nt.response.header', type: 'method', detail: '(name)', info: 'Get header value (case-insensitive)', apply: "nt.response.header('${name}')" },

  // nt.getVar / nt.setVar
  { label: 'nt.getVar', type: 'function', detail: '(name)', info: 'Get an environment variable value', apply: "nt.getVar('${name}')" },
  { label: 'nt.setVar', type: 'function', detail: '(name, value, scope?)', info: 'Set an environment variable', apply: "nt.setVar('${name}', '${value}')" },

  // nt.env / nt.globals (convenience aliases)
  { label: 'nt.env.get', type: 'function', detail: '(key)', info: 'Get an environment variable', apply: "nt.env.get('${key}')" },
  { label: 'nt.env.set', type: 'function', detail: '(key, value)', info: 'Set an environment variable', apply: "nt.env.set('${key}', '${value}')" },
  { label: 'nt.globals.get', type: 'function', detail: '(key)', info: 'Get a global variable', apply: "nt.globals.get('${key}')" },
  { label: 'nt.globals.set', type: 'function', detail: '(key, value)', info: 'Set a global variable', apply: "nt.globals.set('${key}', '${value}')" },

  // nt.test
  { label: 'nt.test', type: 'function', detail: '(name, fn)', info: 'Define a test assertion', apply: "nt.test('${name}', () => {\n  \n})" },

  // nt.uuid
  { label: 'nt.uuid', type: 'function', detail: '()', info: 'Generate a UUID v4', apply: 'nt.uuid()' },

  // nt.hash.*
  { label: 'nt.hash.md5', type: 'function', detail: '(str)', info: 'MD5 hash a string', apply: "nt.hash.md5('${input}')" },
  { label: 'nt.hash.sha256', type: 'function', detail: '(str)', info: 'SHA-256 hash a string', apply: "nt.hash.sha256('${input}')" },

  // nt.base64.*
  { label: 'nt.base64.encode', type: 'function', detail: '(str)', info: 'Base64 encode a string', apply: "nt.base64.encode('${input}')" },
  { label: 'nt.base64.decode', type: 'function', detail: '(str)', info: 'Base64 decode a string', apply: "nt.base64.decode('${input}')" },

  // nt.random.*
  { label: 'nt.random.int', type: 'function', detail: '(min, max)', info: 'Random integer in range', apply: 'nt.random.int(0, 100)' },
  { label: 'nt.random.float', type: 'function', detail: '(min, max)', info: 'Random float in range', apply: 'nt.random.float(0, 1)' },
  { label: 'nt.random.string', type: 'function', detail: '(length)', info: 'Random alphanumeric string', apply: 'nt.random.string(16)' },
  { label: 'nt.random.boolean', type: 'function', detail: '()', info: 'Random true/false', apply: 'nt.random.boolean()' },

  // nt.timestamp.*
  { label: 'nt.timestamp.unix', type: 'function', detail: '()', info: 'Current Unix timestamp (seconds)', apply: 'nt.timestamp.unix()' },
  { label: 'nt.timestamp.unixMs', type: 'function', detail: '()', info: 'Current Unix timestamp (milliseconds)', apply: 'nt.timestamp.unixMs()' },
  { label: 'nt.timestamp.iso', type: 'function', detail: '()', info: 'Current ISO 8601 timestamp', apply: 'nt.timestamp.iso()' },

  // nt.setNextRequest
  { label: 'nt.setNextRequest', type: 'function', detail: '(nameOrId)', info: 'Set the next request to execute in a collection run', apply: "nt.setNextRequest('${requestName}')" },

  // nt.sendRequest
  { label: 'nt.sendRequest', type: 'function', detail: '(config)', info: 'Send an HTTP request from within a script', apply: "nt.sendRequest({ url: '${url}', method: 'GET' })" },

  // nt.delay
  { label: 'nt.delay', type: 'function', detail: '(ms)', info: 'Delay execution for ms milliseconds', apply: 'await nt.delay(1000)' },

  // nt.cookies.*
  { label: 'nt.cookies.getAll', type: 'function', detail: '()', info: 'Get all cookies', apply: 'await nt.cookies.getAll()' },
  { label: 'nt.cookies.get', type: 'function', detail: '(name)', info: 'Get a cookie by name', apply: "await nt.cookies.get('${name}')" },
  { label: 'nt.cookies.set', type: 'function', detail: '(cookie)', info: 'Set a cookie', apply: "await nt.cookies.set({ name: '${name}', value: '${value}', domain: '${domain}', path: '/' })" },
  { label: 'nt.cookies.delete', type: 'function', detail: '(domain, name)', info: 'Delete a cookie', apply: "await nt.cookies.delete('${domain}', '${name}')" },
  { label: 'nt.cookies.clear', type: 'function', detail: '()', info: 'Clear all cookies', apply: 'await nt.cookies.clear()' },
];

function ntCompletionSource(context: CompletionContext): CompletionResult | null {
  // Match `nt` followed by optional `.something` chains
  const match = context.matchBefore(/nt(\.\w*)*\.?\w*/);
  if (!match || match.from === match.to && !context.explicit) return null;

  const prefix = match.text;

  // Filter completions that start with the current prefix
  const options = ntCompletions.filter(c => c.label.startsWith(prefix) || prefix.startsWith(c.label.split('.').slice(0, -1).join('.')));

  if (options.length === 0) return null;

  return {
    from: match.from,
    options,
    validFor: /^[\w.]*$/,
  };
}

export function ntAutocomplete(): Extension {
  return autocompletion({
    override: [ntCompletionSource],
    activateOnTyping: true,
    maxRenderedOptions: 30,
  });
}
