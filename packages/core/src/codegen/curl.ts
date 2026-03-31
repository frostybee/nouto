import { getUrlWithApiKey, getEffectiveHeaders, getBodyContent, getFormDataItems, getBasicAuth, getDigestAuth, getNtlmAuth, getAwsAuth, getProxy, getSsl, buildProxyUrl, type CodegenRequest, type CodegenTarget } from './index';

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

  // Digest auth
  const digestAuth = getDigestAuth(request);
  if (digestAuth) {
    parts.push('--digest', '-u', shellEscape(`${digestAuth.username}:${digestAuth.password}`));
  }

  // NTLM auth
  const ntlmAuth = getNtlmAuth(request);
  if (ntlmAuth) {
    const user = ntlmAuth.domain ? `${ntlmAuth.domain}\\${ntlmAuth.username}` : ntlmAuth.username;
    parts.push('--ntlm', '-u', shellEscape(`${user}:${ntlmAuth.password}`));
  }

  // AWS SigV4
  const awsAuth = getAwsAuth(request);
  if (awsAuth) {
    parts.push('--aws-sigv4', shellEscape(`aws:amz:${awsAuth.region}:${awsAuth.service}`));
    parts.push('-u', shellEscape(`${awsAuth.accessKey}:${awsAuth.secretKey}`));
    if (awsAuth.sessionToken) {
      parts.push('-H', shellEscape(`X-Amz-Security-Token: ${awsAuth.sessionToken}`));
    }
  }

  // Proxy
  const proxy = getProxy(request);
  if (proxy) {
    parts.push('--proxy', shellEscape(buildProxyUrl(proxy)));
  }

  // SSL
  const ssl = getSsl(request);
  if (ssl) {
    if (ssl.rejectUnauthorized === false) parts.push('--insecure');
    if (ssl.certPath) parts.push('--cert', shellEscape(ssl.certPath));
    if (ssl.keyPath) parts.push('--key', shellEscape(ssl.keyPath));
    if (ssl.passphrase) parts.push('--pass', shellEscape(ssl.passphrase));
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
