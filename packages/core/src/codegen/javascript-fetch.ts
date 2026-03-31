import { getUrlWithApiKey, getEffectiveHeaders, getBodyContent, getFormDataItems, getBasicAuth, getDigestAuth, getNtlmAuth, getAwsAuth, getSsl, type CodegenRequest, type CodegenTarget } from './index';

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

  // SSL: Node.js fetch with custom agent
  const ssl = getSsl(request);
  if (ssl) {
    lines.push('');
    lines.push('// SSL configuration (Node.js with undici or custom agent)');
    if (ssl.rejectUnauthorized === false) lines.push('// process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";');
    if (ssl.certPath) lines.push(`// Certificate: ${ssl.certPath}`);
    if (ssl.keyPath) lines.push(`// Key: ${ssl.keyPath}`);
  }

  // Digest/NTLM/AWS comments for fetch (no native support)
  const digestAuth = getDigestAuth(request);
  const ntlmAuth = getNtlmAuth(request);
  const awsAuth = getAwsAuth(request);
  if (digestAuth) {
    lines.push('');
    lines.push('// Note: Fetch API does not natively support Digest auth.');
    lines.push('// Use a library like digest-fetch or implement the challenge-response manually.');
  }
  if (ntlmAuth) {
    lines.push('');
    lines.push('// Note: Fetch API does not natively support NTLM auth.');
    lines.push('// Use a library like node-fetch-ntlm or httpntlm.');
  }
  if (awsAuth) {
    lines.push('');
    lines.push('// Note: For AWS Signature V4, use @aws-sdk/signature-v4 to sign the request.');
    lines.push(`// Region: ${awsAuth.region}, Service: ${awsAuth.service}`);
  }

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
