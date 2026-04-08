import type { SavedRequest, HttpMethod, KeyValue, AuthState, BodyState } from '../types';
import { generateId } from '../types';

// Re-implements a minimal cURL parser on the extension side.
// The webview has its own version (src/webview/src/lib/curl-parser.ts) for paste handling.

interface ParsedCurl {
  method: HttpMethod;
  url: string;
  headers: KeyValue[];
  params: KeyValue[];
  auth: AuthState;
  body: BodyState;
}

export class CurlParserService {
  importFromString(content: string): SavedRequest {
    const parsed = parseCurl(content.trim());
    const now = new Date().toISOString();

    return {
      type: 'request',
      id: generateId(),
      name: this.nameFromUrl(parsed.url),
      method: parsed.method,
      url: parsed.url,
      params: parsed.params,
      headers: parsed.headers,
      auth: parsed.auth,
      body: parsed.body,
      createdAt: now,
      updatedAt: now,
    };
  }

  private nameFromUrl(url: string): string {
    try {
      const u = new URL(url);
      const parts = u.pathname.split('/').filter(Boolean);
      return parts.length > 0 ? parts[parts.length - 1] : u.hostname;
    } catch {
      return 'Imported cURL Request';
    }
  }
}

function parseCurl(input: string): ParsedCurl {
  const tokens = tokenize(input);
  if (tokens.length === 0 || tokens[0].toLowerCase() !== 'curl') {
    throw new Error('Not a cURL command');
  }

  let method: HttpMethod = 'GET';
  let url = '';
  const headers: KeyValue[] = [];
  let bodyContent = '';
  let bodyType: BodyState['type'] = 'none';
  let auth: AuthState = { type: 'none' };
  const formFields: KeyValue[] = [];
  let hasExplicitMethod = false;

  let i = 1;
  while (i < tokens.length) {
    const token = tokens[i];
    switch (token) {
      case '-X': case '--request': {
        const v = tokens[++i]; if (v) { method = v.toUpperCase() as HttpMethod; hasExplicitMethod = true; } break;
      }
      case '-H': case '--header': {
        const v = tokens[++i];
        if (v) {
          const ci = v.indexOf(':');
          if (ci > 0) headers.push({ id: generateId(), key: v.substring(0, ci).trim(), value: v.substring(ci + 1).trim(), enabled: true });
        }
        break;
      }
      case '-u': case '--user': {
        const v = tokens[++i];
        if (v) {
          const ci = v.indexOf(':');
          auth = ci > 0
            ? { type: 'basic', username: v.substring(0, ci), password: v.substring(ci + 1) }
            : { type: 'basic', username: v, password: '' };
        }
        break;
      }
      case '-d': case '--data': case '--data-raw': case '--data-binary': case '--data-ascii': {
        const v = tokens[++i]; if (v) { bodyContent = v; if (!hasExplicitMethod) method = 'POST'; } break;
      }
      case '-F': case '--form': {
        const v = tokens[++i];
        if (v) {
          const ei = v.indexOf('=');
          if (ei > 0) formFields.push({ id: generateId(), key: v.substring(0, ei), value: v.substring(ei + 1), enabled: true });
        }
        if (!hasExplicitMethod) method = 'POST';
        break;
      }
      case '-b': case '--cookie': {
        const v = tokens[++i]; if (v) headers.push({ id: generateId(), key: 'Cookie', value: v, enabled: true }); break;
      }
      case '-L': case '--location': case '-s': case '--silent': case '-S': case '--show-error':
      case '-k': case '--insecure': case '-v': case '--verbose': case '-i': case '--include': case '--compressed':
        break;
      case '-o': case '--output': case '-w': case '--write-out': case '--connect-timeout': case '-m': case '--max-time':
        i++; break;
      default:
        if (!token.startsWith('-') && !url) url = token;
        break;
    }
    i++;
  }

  // Detect auth from Authorization header
  if (auth.type === 'none') {
    const idx = headers.findIndex(h => h.key.toLowerCase() === 'authorization');
    if (idx >= 0) {
      const val = headers[idx].value;
      if (val.toLowerCase().startsWith('bearer ')) {
        auth = { type: 'bearer', token: val.substring(7).trim() };
        headers.splice(idx, 1);
      }
    }
  }

  // Detect body type from Content-Type
  const ctHeader = headers.find(h => h.key.toLowerCase() === 'content-type');
  const ct = ctHeader?.value?.toLowerCase() || '';

  if (formFields.length > 0) {
    bodyType = 'form-data';
  } else if (bodyContent) {
    if (ct.includes('application/json') || isJsonLike(bodyContent)) bodyType = 'json';
    else if (ct.includes('application/x-www-form-urlencoded')) bodyType = 'x-www-form-urlencoded';
    else bodyType = 'text';
  }

  // Extract query params from URL
  const params: KeyValue[] = [];
  if (url) {
    try {
      const urlObj = new URL(url);
      urlObj.searchParams.forEach((value, key) => {
        params.push({ id: generateId(), key, value, enabled: true });
      });
      if (params.length > 0) url = urlObj.origin + urlObj.pathname;
    } catch { /* leave as-is */ }
  }

  const body: BodyState = formFields.length > 0
    ? { type: 'form-data', content: JSON.stringify(formFields) }
    : { type: bodyType, content: bodyContent };

  return { method, url, headers, params, auth, body };
}

function isJsonLike(str: string): boolean {
  const t = str.trim();
  return (t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'));
}

function tokenize(input: string): string[] {
  const normalized = input.replace(/\\\r?\n/g, ' ').replace(/`\r?\n/g, ' ').trim();
  const tokens: string[] = [];
  let i = 0;
  const len = normalized.length;

  while (i < len) {
    while (i < len && /\s/.test(normalized[i])) i++;
    if (i >= len) break;
    const ch = normalized[i];
    if (ch === "'") {
      i++; let s = '';
      while (i < len && normalized[i] !== "'") s += normalized[i++];
      i++; tokens.push(s);
    } else if (ch === '"') {
      i++; let s = '';
      while (i < len && normalized[i] !== '"') {
        if (normalized[i] === '\\' && i + 1 < len) { i++; s += normalized[i]; } else { s += normalized[i]; }
        i++;
      }
      i++; tokens.push(s);
    } else {
      let s = '';
      while (i < len && !/\s/.test(normalized[i])) {
        if (normalized[i] === '\\' && i + 1 < len) { i++; s += normalized[i]; } else { s += normalized[i]; }
        i++;
      }
      tokens.push(s);
    }
  }
  return tokens;
}
