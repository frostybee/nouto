import type { HttpMethod, KeyValue, AuthState, BodyState } from '../types';
import { generateId } from '../types';

export interface ParsedRequest {
  method: HttpMethod;
  url: string;
  headers: KeyValue[];
  params: KeyValue[];
  auth: AuthState;
  body: BodyState;
}

export function isCurlCommand(text: string): boolean {
  const trimmed = text.trim();
  return /^curl\s/i.test(trimmed);
}

export function parseCurl(input: string): ParsedRequest {
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
      case '-X':
      case '--request': {
        const val = tokens[++i];
        if (val) {
          method = val.toUpperCase() as HttpMethod;
          hasExplicitMethod = true;
        }
        break;
      }

      case '-H':
      case '--header': {
        const val = tokens[++i];
        if (val) {
          const colonIdx = val.indexOf(':');
          if (colonIdx > 0) {
            const key = val.substring(0, colonIdx).trim();
            const value = val.substring(colonIdx + 1).trim();
            headers.push({ id: generateId(), key, value, enabled: true });
          }
        }
        break;
      }

      case '-u':
      case '--user': {
        const val = tokens[++i];
        if (val) {
          const colonIdx = val.indexOf(':');
          if (colonIdx > 0) {
            auth = {
              type: 'basic',
              username: val.substring(0, colonIdx),
              password: val.substring(colonIdx + 1),
            };
          } else {
            auth = { type: 'basic', username: val, password: '' };
          }
        }
        break;
      }

      case '-d':
      case '--data':
      case '--data-raw':
      case '--data-binary':
      case '--data-ascii': {
        const val = tokens[++i];
        if (val) {
          bodyContent = val;
          if (!hasExplicitMethod) method = 'POST';
        }
        break;
      }

      case '-F':
      case '--form': {
        const val = tokens[++i];
        if (val) {
          const eqIdx = val.indexOf('=');
          if (eqIdx > 0) {
            formFields.push({
              id: generateId(),
              key: val.substring(0, eqIdx),
              value: val.substring(eqIdx + 1),
              enabled: true,
            });
          }
        }
        if (!hasExplicitMethod) method = 'POST';
        break;
      }

      case '-b':
      case '--cookie': {
        const val = tokens[++i];
        if (val) {
          headers.push({ id: generateId(), key: 'Cookie', value: val, enabled: true });
        }
        break;
      }

      case '-A':
      case '--user-agent': {
        const val = tokens[++i];
        if (val) {
          headers.push({ id: generateId(), key: 'User-Agent', value: val, enabled: true });
        }
        break;
      }

      case '-e':
      case '--referer': {
        const val = tokens[++i];
        if (val) {
          headers.push({ id: generateId(), key: 'Referer', value: val, enabled: true });
        }
        break;
      }

      case '-L':
      case '--location':
      case '-s':
      case '--silent':
      case '-S':
      case '--show-error':
      case '-k':
      case '--insecure':
      case '-v':
      case '--verbose':
      case '-i':
      case '--include':
      case '--compressed':
        // Flags without values - skip
        break;

      case '-o':
      case '--output':
      case '-w':
      case '--write-out':
      case '--connect-timeout':
      case '-m':
      case '--max-time':
        // Flags with values - skip both
        i++;
        break;

      default:
        // Positional argument - likely the URL
        if (!token.startsWith('-') && !url) {
          url = token;
        }
        break;
    }
    i++;
  }

  // Detect auth from headers
  if (auth.type === 'none') {
    const authHeaderIdx = headers.findIndex(h => h.key.toLowerCase() === 'authorization');
    if (authHeaderIdx >= 0) {
      const authValue = headers[authHeaderIdx].value;
      if (authValue.toLowerCase().startsWith('bearer ')) {
        auth = { type: 'bearer', token: authValue.substring(7).trim() };
        headers.splice(authHeaderIdx, 1);
      } else if (authValue.toLowerCase().startsWith('basic ')) {
        try {
          const decoded = atob(authValue.substring(6).trim());
          const colonIdx = decoded.indexOf(':');
          if (colonIdx > 0) {
            auth = {
              type: 'basic',
              username: decoded.substring(0, colonIdx),
              password: decoded.substring(colonIdx + 1),
            };
          }
        } catch {
          // Leave as header
        }
        if (auth.type === 'basic') {
          headers.splice(authHeaderIdx, 1);
        }
      }
    }
  }

  // Determine body type from Content-Type header
  const contentTypeHeader = headers.find(h => h.key.toLowerCase() === 'content-type');
  const contentType = contentTypeHeader?.value?.toLowerCase() || '';

  if (formFields.length > 0) {
    bodyType = 'form-data';
    bodyContent = '';
  } else if (bodyContent) {
    if (contentType.includes('application/json') || isJsonLike(bodyContent)) {
      bodyType = 'json';
    } else if (contentType.includes('application/x-www-form-urlencoded')) {
      bodyType = 'x-www-form-urlencoded';
    } else {
      bodyType = 'text';
    }
  }

  // Extract query params from URL
  const params: KeyValue[] = [];
  if (url) {
    try {
      const urlObj = new URL(url);
      urlObj.searchParams.forEach((value, key) => {
        params.push({ id: generateId(), key, value, enabled: true });
      });
      // Remove query params from URL
      if (params.length > 0) {
        url = urlObj.origin + urlObj.pathname;
      }
    } catch {
      // URL might not be fully valid; leave as-is
    }
  }

  // Build body state
  let body: BodyState;
  if (formFields.length > 0) {
    body = { type: 'form-data', content: JSON.stringify(formFields) };
  } else {
    body = { type: bodyType, content: bodyContent };
  }

  return { method, url, headers, params, auth, body };
}

function isJsonLike(str: string): boolean {
  const trimmed = str.trim();
  return (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
         (trimmed.startsWith('[') && trimmed.endsWith(']'));
}

export function tokenize(input: string): string[] {
  // Normalize line continuations (backslash + newline)
  const normalized = input
    .replace(/\\\r?\n/g, ' ')
    .replace(/`\r?\n/g, ' ')  // PowerShell continuation
    .trim();

  const tokens: string[] = [];
  let i = 0;
  const len = normalized.length;

  while (i < len) {
    // Skip whitespace
    while (i < len && /\s/.test(normalized[i])) i++;
    if (i >= len) break;

    const ch = normalized[i];

    if (ch === "'") {
      // Single-quoted string
      i++;
      let str = '';
      while (i < len && normalized[i] !== "'") {
        str += normalized[i];
        i++;
      }
      i++; // closing quote
      tokens.push(str);
    } else if (ch === '"') {
      // Double-quoted string (with backslash escapes)
      i++;
      let str = '';
      while (i < len && normalized[i] !== '"') {
        if (normalized[i] === '\\' && i + 1 < len) {
          i++;
          str += normalized[i];
        } else {
          str += normalized[i];
        }
        i++;
      }
      i++; // closing quote
      tokens.push(str);
    } else if (ch === '$' && i + 1 < len && normalized[i + 1] === "'") {
      // ANSI-C quoting: $'...'
      i += 2;
      let str = '';
      while (i < len && normalized[i] !== "'") {
        if (normalized[i] === '\\' && i + 1 < len) {
          i++;
          switch (normalized[i]) {
            case 'n': str += '\n'; break;
            case 't': str += '\t'; break;
            case 'r': str += '\r'; break;
            case '\\': str += '\\'; break;
            case "'": str += "'"; break;
            default: str += '\\' + normalized[i]; break;
          }
        } else {
          str += normalized[i];
        }
        i++;
      }
      i++; // closing quote
      tokens.push(str);
    } else {
      // Unquoted token
      let str = '';
      while (i < len && !/\s/.test(normalized[i])) {
        if (normalized[i] === '\\' && i + 1 < len) {
          i++;
          str += normalized[i];
        } else {
          str += normalized[i];
        }
        i++;
      }
      tokens.push(str);
    }
  }

  return tokens;
}
