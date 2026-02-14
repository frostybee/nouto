import { getUrlWithApiKey, getEffectiveHeaders, getBodyContent, getFormDataItems, getBasicAuth, type CodegenRequest, type CodegenTarget } from './index';

function pyStr(s: string): string {
  return "'" + s.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
}

function generate(request: CodegenRequest): string {
  const lines: string[] = [];
  const url = getUrlWithApiKey(request);
  const headers = getEffectiveHeaders(request);
  const basicAuth = getBasicAuth(request);
  const hasBody = ['POST', 'PUT', 'PATCH'].includes(request.method) && request.body.type !== 'none';
  const isFormData = request.body.type === 'form-data';

  lines.push('import requests');
  lines.push('');

  lines.push(`url = ${pyStr(url)}`);

  if (headers.length > 0 && !(isFormData && headers.every(h => h.key.toLowerCase() === 'content-type'))) {
    lines.push('headers = {');
    for (const h of headers) {
      if (isFormData && h.key.toLowerCase() === 'content-type') continue;
      lines.push(`    ${pyStr(h.key)}: ${pyStr(h.value)},`);
    }
    lines.push('}');
  }

  if (hasBody && isFormData) {
    const items = getFormDataItems(request);
    const textItems = items.filter(i => i.fieldType !== 'file');
    const fileItems = items.filter(i => i.fieldType === 'file');

    if (textItems.length > 0) {
      lines.push('data = {');
      for (const item of textItems) {
        lines.push(`    ${pyStr(item.key)}: ${pyStr(item.value)},`);
      }
      lines.push('}');
    }

    if (fileItems.length > 0) {
      lines.push('files = {');
      for (const item of fileItems) {
        lines.push(`    ${pyStr(item.key)}: open(${pyStr(item.value)}, 'rb'),`);
      }
      lines.push('}');
    }
  }

  if (hasBody && request.body.type === 'json') {
    const body = getBodyContent(request);
    if (body) {
      try {
        JSON.parse(body);
        lines.push(`json_data = ${body}`);
      } catch {
        lines.push(`data = ${pyStr(body)}`);
      }
    }
  } else if (hasBody && !isFormData) {
    const body = getBodyContent(request);
    if (body) lines.push(`data = ${pyStr(body)}`);
  }

  lines.push('');
  const method = request.method.toLowerCase();

  const args: string[] = ['url'];
  if (headers.length > 0) args.push('headers=headers');
  if (basicAuth) args.push(`auth=(${pyStr(basicAuth.username)}, ${pyStr(basicAuth.password)})`);
  if (hasBody && request.body.type === 'json') args.push('json=json_data');
  else if (hasBody && isFormData) {
    const items = getFormDataItems(request);
    if (items.some(i => i.fieldType !== 'file')) args.push('data=data');
    if (items.some(i => i.fieldType === 'file')) args.push('files=files');
  }
  else if (hasBody) args.push('data=data');

  lines.push(`response = requests.${method}(${args.join(', ')})`);
  lines.push('');
  lines.push('print(response.status_code)');
  lines.push('print(response.json())');

  return lines.join('\n');
}

export const target: CodegenTarget = {
  id: 'python-requests',
  label: 'Python - Requests',
  language: 'python',
  generate,
};
