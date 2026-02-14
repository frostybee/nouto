import { getUrlWithApiKey, getEffectiveHeaders, getBodyContent, getFormDataItems, getBasicAuth, type CodegenRequest, type CodegenTarget } from './index';

function phpStr(s: string): string {
  return "'" + s.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
}

function generate(request: CodegenRequest): string {
  const lines: string[] = [];
  const url = getUrlWithApiKey(request);
  const headers = getEffectiveHeaders(request);
  const basicAuth = getBasicAuth(request);
  const hasBody = ['POST', 'PUT', 'PATCH'].includes(request.method) && request.body.type !== 'none';
  const isFormData = request.body.type === 'form-data';

  lines.push('<?php');
  lines.push('');
  lines.push('$ch = curl_init();');
  lines.push('');
  lines.push(`curl_setopt($ch, CURLOPT_URL, ${phpStr(url)});`);
  lines.push('curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);');

  if (request.method !== 'GET') {
    lines.push(`curl_setopt($ch, CURLOPT_CUSTOMREQUEST, ${phpStr(request.method)});`);
  }

  if (headers.length > 0) {
    lines.push('curl_setopt($ch, CURLOPT_HTTPHEADER, [');
    for (const h of headers) {
      if (isFormData && h.key.toLowerCase() === 'content-type') continue;
      lines.push(`    ${phpStr(h.key + ': ' + h.value)},`);
    }
    lines.push(']);');
  }

  if (basicAuth) {
    lines.push(`curl_setopt($ch, CURLOPT_USERPWD, ${phpStr(basicAuth.username + ':' + basicAuth.password)});`);
  }

  if (hasBody) {
    if (isFormData) {
      const items = getFormDataItems(request);
      lines.push('curl_setopt($ch, CURLOPT_POSTFIELDS, [');
      for (const item of items) {
        if (item.fieldType === 'file') {
          lines.push(`    ${phpStr(item.key)} => new CURLFile(${phpStr(item.value)}),`);
        } else {
          lines.push(`    ${phpStr(item.key)} => ${phpStr(item.value)},`);
        }
      }
      lines.push(']);');
    } else {
      const body = getBodyContent(request);
      if (body) {
        lines.push(`curl_setopt($ch, CURLOPT_POSTFIELDS, ${phpStr(body)});`);
      }
    }
  }

  lines.push('');
  lines.push('$response = curl_exec($ch);');
  lines.push('$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);');
  lines.push('curl_close($ch);');
  lines.push('');
  lines.push('echo "Status: $httpCode\\n";');
  lines.push('echo $response;');

  return lines.join('\n');
}

export const target: CodegenTarget = {
  id: 'php',
  label: 'PHP - cURL',
  language: 'php',
  generate,
};
