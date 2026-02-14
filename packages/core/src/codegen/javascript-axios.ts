import { getUrlWithApiKey, getEffectiveHeaders, getBodyContent, getFormDataItems, getBasicAuth, type CodegenRequest, type CodegenTarget } from './index';

function generate(request: CodegenRequest): string {
  const lines: string[] = [];
  const url = getUrlWithApiKey(request);
  const headers = getEffectiveHeaders(request);
  const basicAuth = getBasicAuth(request);
  const hasBody = ['POST', 'PUT', 'PATCH'].includes(request.method) && request.body.type !== 'none';
  const isFormData = request.body.type === 'form-data';

  lines.push("import axios from 'axios';");
  lines.push('');

  if (isFormData && hasBody) {
    lines.push('const formData = new FormData();');
    const items = getFormDataItems(request);
    for (const item of items) {
      if (item.fieldType === 'file') {
        lines.push(`// formData.append('${item.key}', fs.createReadStream('${item.value}'));`);
      } else {
        lines.push(`formData.append('${item.key}', '${item.value}');`);
      }
    }
    lines.push('');
  }

  lines.push('const response = await axios({');
  lines.push(`  method: '${request.method.toLowerCase()}',`);
  lines.push(`  url: '${url}',`);

  if (headers.length > 0) {
    const filteredHeaders = isFormData ? headers.filter(h => h.key.toLowerCase() !== 'content-type') : headers;
    if (filteredHeaders.length > 0) {
      lines.push('  headers: {');
      for (const h of filteredHeaders) {
        lines.push(`    '${h.key}': '${h.value}',`);
      }
      lines.push('  },');
    }
  }

  if (basicAuth) {
    lines.push('  auth: {');
    lines.push(`    username: '${basicAuth.username}',`);
    lines.push(`    password: '${basicAuth.password}',`);
    lines.push('  },');
  }

  if (hasBody) {
    if (isFormData) {
      lines.push('  data: formData,');
    } else if (request.body.type === 'json') {
      const body = getBodyContent(request);
      if (body) {
        try {
          JSON.parse(body);
          lines.push(`  data: ${body},`);
        } catch {
          lines.push(`  data: ${JSON.stringify(body)},`);
        }
      }
    } else {
      const body = getBodyContent(request);
      if (body) lines.push(`  data: ${JSON.stringify(body)},`);
    }
  }

  lines.push('});');
  lines.push('');
  lines.push('console.log(response.data);');

  return lines.join('\n');
}

export const target: CodegenTarget = {
  id: 'javascript-axios',
  label: 'JavaScript - Axios',
  language: 'javascript',
  generate,
};
