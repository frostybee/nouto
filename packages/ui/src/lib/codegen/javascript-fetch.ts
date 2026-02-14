import { getUrlWithApiKey, getEffectiveHeaders, getBodyContent, getFormDataItems, getBasicAuth, type CodegenRequest, type CodegenTarget } from './index';

function generate(request: CodegenRequest): string {
  const lines: string[] = [];
  const url = getUrlWithApiKey(request);
  const headers = getEffectiveHeaders(request);
  const basicAuth = getBasicAuth(request);

  if (basicAuth) {
    headers.push({ key: 'Authorization', value: `Basic \${btoa('${basicAuth.username}:${basicAuth.password}')}` });
  }

  const hasBody = ['POST', 'PUT', 'PATCH'].includes(request.method) && request.body.type !== 'none';
  const isFormData = request.body.type === 'form-data';

  if (isFormData && hasBody) {
    lines.push('const formData = new FormData();');
    const items = getFormDataItems(request);
    for (const item of items) {
      if (item.fieldType === 'file') {
        lines.push(`// formData.append('${item.key}', fileInput.files[0]);`);
      } else {
        lines.push(`formData.append('${item.key}', '${item.value}');`);
      }
    }
    lines.push('');
  }

  lines.push(`const response = await fetch('${url}', {`);
  lines.push(`  method: '${request.method}',`);

  if (headers.length > 0 && !isFormData) {
    lines.push('  headers: {');
    for (const h of headers) {
      if (h.key.toLowerCase() === 'content-type' && isFormData) continue;
      lines.push(`    '${h.key}': '${h.value}',`);
    }
    lines.push('  },');
  } else if (headers.length > 0) {
    const nonCtHeaders = headers.filter(h => h.key.toLowerCase() !== 'content-type');
    if (nonCtHeaders.length > 0) {
      lines.push('  headers: {');
      for (const h of nonCtHeaders) {
        lines.push(`    '${h.key}': '${h.value}',`);
      }
      lines.push('  },');
    }
  }

  if (hasBody) {
    if (isFormData) {
      lines.push('  body: formData,');
    } else if (request.body.type === 'json') {
      const body = getBodyContent(request);
      if (body) {
        try {
          JSON.parse(body);
          lines.push(`  body: JSON.stringify(${body}),`);
        } catch {
          lines.push(`  body: ${JSON.stringify(body)},`);
        }
      }
    } else {
      const body = getBodyContent(request);
      if (body) lines.push(`  body: ${JSON.stringify(body)},`);
    }
  }

  lines.push('});');
  lines.push('');
  lines.push('const data = await response.json();');
  lines.push('console.log(data);');

  return lines.join('\n');
}

export const target: CodegenTarget = {
  id: 'javascript-fetch',
  label: 'JavaScript - Fetch',
  language: 'javascript',
  generate,
};
