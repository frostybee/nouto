import { getUrlWithApiKey, getEffectiveHeaders, getBodyContent, getFormDataItems, getBasicAuth, type CodegenRequest, type CodegenTarget } from './index';

function shellEscape(str: string): string {
  if (/^[a-zA-Z0-9_./:@=]+$/.test(str) && !str.startsWith('-')) return str;
  return "'" + str.replace(/'/g, "'\\''") + "'";
}

function generate(request: CodegenRequest): string {
  const parts: string[] = ['curl'];

  if (request.method !== 'GET') {
    parts.push('-X', request.method);
  }

  const fullUrl = getUrlWithApiKey(request);
  parts.push(shellEscape(fullUrl));

  // Headers (skip auth-related, handled below)
  const headers = getEffectiveHeaders(request);
  for (const h of headers) {
    parts.push('-H', shellEscape(`${h.key}: ${h.value}`));
  }

  // Basic auth
  const basicAuth = getBasicAuth(request);
  if (basicAuth) {
    parts.push('-u', shellEscape(`${basicAuth.username}:${basicAuth.password}`));
  }

  // Body
  if (request.body.type === 'binary' && request.body.fileName) {
    parts.push('--data-binary', `@${shellEscape(request.body.content || request.body.fileName)}`);
  } else if (request.body.type === 'form-data') {
    const items = getFormDataItems(request);
    for (const item of items) {
      if (item.fieldType === 'file' && item.fileName) {
        const mime = (item as any).fileMimeType ? `;type=${(item as any).fileMimeType}` : '';
        parts.push('-F', shellEscape(`${item.key}=@${item.value}${mime}`));
      } else {
        parts.push('-F', shellEscape(`${item.key}=${item.value}`));
      }
    }
  } else {
    const body = getBodyContent(request);
    if (body) {
      parts.push('-d', shellEscape(body));
    }
  }

  return parts.join(' \\\n  ');
}

export const target: CodegenTarget = {
  id: 'curl',
  label: 'cURL',
  language: 'shellscript',
  generate,
};
