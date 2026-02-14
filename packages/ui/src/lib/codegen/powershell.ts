import { getUrlWithApiKey, getEffectiveHeaders, getBodyContent, getFormDataItems, getBasicAuth, type CodegenRequest, type CodegenTarget } from './index';

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

  const args: string[] = [];
  args.push(`-Uri "${url}"`);
  args.push(`-Method ${request.method}`);
  if (headers.length > 0 || basicAuth) args.push('-Headers $headers');
  if (hasBody) {
    if (isFormData) {
      args.push('-Form $form');
    } else {
      args.push('-Body $body');
      const ct = headers.find(h => h.key.toLowerCase() === 'content-type');
      if (ct) args.push(`-ContentType "${ct.value}"`);
    }
  }

  lines.push(`$response = Invoke-RestMethod ${args.join(' `')}`);
  lines.push('$response');

  return lines.join('\n');
}

export const target: CodegenTarget = {
  id: 'powershell',
  label: 'PowerShell',
  language: 'powershell',
  generate,
};
