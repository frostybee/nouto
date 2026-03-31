import { getUrlWithApiKey, getEffectiveHeaders, getBodyContent, getFormDataItems, getBasicAuth, getDigestAuth, getNtlmAuth, getAwsAuth, getProxy, getSsl, buildProxyUrl, type CodegenRequest, type CodegenTarget } from './index';

function generate(request: CodegenRequest): string {
  const lines: string[] = [];
  const url = getUrlWithApiKey(request);
  const headers = getEffectiveHeaders(request);
  const basicAuth = getBasicAuth(request);
  const hasBody = ['POST', 'PUT', 'PATCH'].includes(request.method) && request.body.type !== 'none';
  const isFormData = request.body.type === 'form-data';

  if (basicAuth) {
    lines.push(`$username = "${basicAuth.username}"`);
    lines.push(`$password = "${basicAuth.password}"`);
    lines.push('$pair = "${username}:${password}"');
    lines.push('$bytes = [System.Text.Encoding]::ASCII.GetBytes($pair)');
    lines.push('$base64 = [System.Convert]::ToBase64String($bytes)');
    lines.push('');
  }

  if (headers.length > 0 || basicAuth) {
    lines.push('$headers = @{');
    for (const h of headers) {
      if (isFormData && h.key.toLowerCase() === 'content-type') continue;
      lines.push(`    "${h.key}" = "${h.value}"`);
    }
    if (basicAuth) {
      lines.push('    "Authorization" = "Basic $base64"');
    }
    lines.push('}');
    lines.push('');
  }

  if (hasBody) {
    if (isFormData) {
      const items = getFormDataItems(request);
      lines.push('$form = @{');
      for (const item of items) {
        if (item.fieldType === 'file') {
          lines.push(`    "${item.key}" = Get-Item -Path "${item.value}"`);
        } else {
          lines.push(`    "${item.key}" = "${item.value}"`);
        }
      }
      lines.push('}');
      lines.push('');
    } else {
      const body = getBodyContent(request);
      if (body) {
        lines.push(`$body = @'`);
        lines.push(body);
        lines.push("'@");
        lines.push('');
      }
    }
  }

  // Digest auth
  const digestAuth = getDigestAuth(request);
  if (digestAuth) {
    lines.push(`$securePassword = ConvertTo-SecureString "${digestAuth.password}" -AsPlainText -Force`);
    lines.push(`$credential = New-Object System.Management.Automation.PSCredential("${digestAuth.username}", $securePassword)`);
    lines.push('');
  }

  // NTLM auth
  const ntlmAuth = getNtlmAuth(request);
  if (ntlmAuth) {
    const user = ntlmAuth.domain ? `${ntlmAuth.domain}\\${ntlmAuth.username}` : ntlmAuth.username;
    lines.push(`$securePassword = ConvertTo-SecureString "${ntlmAuth.password}" -AsPlainText -Force`);
    lines.push(`$credential = New-Object System.Management.Automation.PSCredential("${user}", $securePassword)`);
    lines.push('');
  }

  // AWS SigV4
  const awsAuth = getAwsAuth(request);
  if (awsAuth) {
    lines.push('# AWS Signature V4 requires AWS.Tools.Common module');
    lines.push(`# Region: ${awsAuth.region}, Service: ${awsAuth.service}`);
    lines.push('');
  }

  // Proxy
  const proxy = getProxy(request);

  // SSL
  const ssl = getSsl(request);

  const args: string[] = [];
  args.push(`-Uri "${url}"`);
  args.push(`-Method ${request.method}`);
  if (headers.length > 0 || basicAuth) args.push('-Headers $headers');
  if (digestAuth) args.push('-Credential $credential -Authentication Digest');
  if (ntlmAuth) args.push('-Credential $credential');
  if (hasBody) {
    if (isFormData) {
      args.push('-Form $form');
    } else {
      args.push('-Body $body');
      const ct = headers.find(h => h.key.toLowerCase() === 'content-type');
      if (ct) args.push(`-ContentType "${ct.value}"`);
    }
  }
  if (proxy) args.push(`-Proxy "${buildProxyUrl(proxy)}"`);
  if (proxy?.username) args.push(`-ProxyCredential (New-Object PSCredential("${proxy.username}", (ConvertTo-SecureString "${proxy.password || ''}" -AsPlainText -Force)))`);
  if (ssl?.rejectUnauthorized === false) args.push('-SkipCertificateCheck');
  if (ssl?.certPath) args.push(`-Certificate (Get-PfxCertificate -FilePath "${ssl.certPath}")`);

  lines.push(`$response = Invoke-RestMethod ${args.join(' `\n    ')}`);
  lines.push('$response');

  return lines.join('\n');
}

export const target: CodegenTarget = {
  id: 'powershell',
  label: 'PowerShell',
  language: 'powershell',
  generate,
};
