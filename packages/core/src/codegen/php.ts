import { getUrlWithApiKey, getEffectiveHeaders, getBodyContent, getFormDataItems, getBasicAuth, getDigestAuth, getNtlmAuth, getAwsAuth, getProxy, getSsl, buildProxyUrl, type CodegenRequest, type CodegenTarget } from './index';

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

  // Digest auth
  const digestAuth = getDigestAuth(request);
  if (digestAuth) {
    lines.push(`curl_setopt($ch, CURLOPT_HTTPAUTH, CURLAUTH_DIGEST);`);
    lines.push(`curl_setopt($ch, CURLOPT_USERPWD, ${phpStr(digestAuth.username + ':' + digestAuth.password)});`);
  }

  // NTLM auth
  const ntlmAuth = getNtlmAuth(request);
  if (ntlmAuth) {
    const user = ntlmAuth.domain ? `${ntlmAuth.domain}\\${ntlmAuth.username}` : ntlmAuth.username;
    lines.push(`curl_setopt($ch, CURLOPT_HTTPAUTH, CURLAUTH_NTLM);`);
    lines.push(`curl_setopt($ch, CURLOPT_USERPWD, ${phpStr(user + ':' + ntlmAuth.password)});`);
  }

  // AWS SigV4
  const awsAuth = getAwsAuth(request);
  if (awsAuth) {
    lines.push(`curl_setopt($ch, CURLOPT_AWS_SIGV4, ${phpStr(`aws:amz:${awsAuth.region}:${awsAuth.service}`)});`);
    lines.push(`curl_setopt($ch, CURLOPT_USERPWD, ${phpStr(awsAuth.accessKey + ':' + awsAuth.secretKey)});`);
    if (awsAuth.sessionToken) {
      lines.push(`curl_setopt($ch, CURLOPT_HTTPHEADER, array_merge($ch, [${phpStr('X-Amz-Security-Token: ' + awsAuth.sessionToken)}]));`);
    }
  }

  // Proxy
  const proxy = getProxy(request);
  if (proxy) {
    lines.push(`curl_setopt($ch, CURLOPT_PROXY, ${phpStr(buildProxyUrl(proxy))});`);
  }

  // SSL
  const ssl = getSsl(request);
  if (ssl) {
    if (ssl.rejectUnauthorized === false) {
      lines.push('curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);');
      lines.push('curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 0);');
    }
    if (ssl.certPath) lines.push(`curl_setopt($ch, CURLOPT_SSLCERT, ${phpStr(ssl.certPath)});`);
    if (ssl.keyPath) lines.push(`curl_setopt($ch, CURLOPT_SSLKEY, ${phpStr(ssl.keyPath)});`);
    if (ssl.passphrase) lines.push(`curl_setopt($ch, CURLOPT_SSLCERTPASSWD, ${phpStr(ssl.passphrase)});`);
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
