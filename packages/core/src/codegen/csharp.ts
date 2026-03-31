import { getUrlWithApiKey, getEffectiveHeaders, getBodyContent, getFormDataItems, getBasicAuth, getDigestAuth, getNtlmAuth, getAwsAuth, getProxy, getSsl, type CodegenRequest, type CodegenTarget } from './index';

/** Escape a string for use inside a C# double-quoted string literal */
function csStr(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\t/g, '\\t');
}

function generate(request: CodegenRequest): string {
  const lines: string[] = [];
  const url = getUrlWithApiKey(request);
  const headers = getEffectiveHeaders(request);
  const basicAuth = getBasicAuth(request);
  const hasBody = ['POST', 'PUT', 'PATCH'].includes(request.method) && request.body.type !== 'none';
  const isFormData = request.body.type === 'form-data';

  const digestAuth = getDigestAuth(request);
  const ntlmAuth = getNtlmAuth(request);
  const awsAuth = getAwsAuth(request);
  const proxy = getProxy(request);
  const ssl = getSsl(request);
  const needsHandler = digestAuth || ntlmAuth || proxy || ssl;

  lines.push('using System.Net.Http;');
  lines.push('using System.Net.Http.Headers;');
  if (request.body.type === 'json') lines.push('using System.Text;');
  if (needsHandler) lines.push('using System.Net;');
  if (ssl?.certPath) lines.push('using System.Security.Cryptography.X509Certificates;');
  lines.push('');

  if (needsHandler) {
    lines.push('var handler = new HttpClientHandler();');
    if (digestAuth) {
      lines.push(`handler.Credentials = new NetworkCredential("${csStr(digestAuth.username)}", "${csStr(digestAuth.password)}");`);
    }
    if (ntlmAuth) {
      if (ntlmAuth.domain) {
        lines.push(`handler.Credentials = new NetworkCredential("${csStr(ntlmAuth.username)}", "${csStr(ntlmAuth.password)}", "${csStr(ntlmAuth.domain)}");`);
      } else {
        lines.push(`handler.Credentials = new NetworkCredential("${csStr(ntlmAuth.username)}", "${csStr(ntlmAuth.password)}");`);
      }
    }
    if (proxy) {
      lines.push(`handler.Proxy = new WebProxy("${csStr(proxy.host)}", ${proxy.port});`);
      if (proxy.username) {
        lines.push(`handler.Proxy.Credentials = new NetworkCredential("${csStr(proxy.username)}", "${csStr(proxy.password || '')}");`);
      }
    }
    if (ssl?.rejectUnauthorized === false) {
      lines.push('handler.ServerCertificateCustomValidationCallback = (_, _, _, _) => true;');
    }
    if (ssl?.certPath) {
      lines.push(`handler.ClientCertificates.Add(new X509Certificate2("${csStr(ssl.certPath)}"${ssl.passphrase ? `, "${csStr(ssl.passphrase)}"` : ''}));`);
    }
    lines.push('');
    lines.push('using var client = new HttpClient(handler);');
  } else {
    lines.push('using var client = new HttpClient();');
  }

  if (awsAuth) {
    lines.push('');
    lines.push('// AWS Signature V4 requires AWSSDK.Core or manual signing');
    lines.push(`// Region: ${awsAuth.region}, Service: ${awsAuth.service}`);
  }

  // Headers
  for (const h of headers) {
    if (['content-type'].includes(h.key.toLowerCase())) continue;
    lines.push(`client.DefaultRequestHeaders.Add("${csStr(h.key)}", "${csStr(h.value)}");`);
  }

  if (basicAuth) {
    lines.push(`client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Basic",`);
    lines.push(`    Convert.ToBase64String(System.Text.Encoding.ASCII.GetBytes("${csStr(basicAuth.username)}:${csStr(basicAuth.password)}")));`);
  }

  lines.push('');

  // Body
  if (hasBody) {
    if (isFormData) {
      lines.push('var formData = new MultipartFormDataContent();');
      const items = getFormDataItems(request);
      for (const item of items) {
        if (item.fieldType === 'file') {
          lines.push(`formData.Add(new StreamContent(File.OpenRead("${csStr(item.value)}")), "${csStr(item.key)}", "${csStr(item.fileName || 'file')}");`);
        } else {
          lines.push(`formData.Add(new StringContent("${csStr(item.value)}"), "${csStr(item.key)}");`);
        }
      }
      lines.push('');
    } else if (request.body.type === 'json') {
      const body = getBodyContent(request);
      if (body) {
        lines.push(`var content = new StringContent(${JSON.stringify(body)}, Encoding.UTF8, "application/json");`);
        lines.push('');
      }
    } else {
      const body = getBodyContent(request);
      const ct = headers.find(h => h.key.toLowerCase() === 'content-type')?.value || 'text/plain';
      if (body) {
        lines.push(`var content = new StringContent(${JSON.stringify(body)}, Encoding.UTF8, "${csStr(ct)}");`);
        lines.push('');
      }
    }
  }

  // Request
  const methodMap: Record<string, string> = {
    GET: 'GetAsync', DELETE: 'DeleteAsync',
    POST: 'PostAsync', PUT: 'PutAsync', PATCH: 'PatchAsync',
    HEAD: 'SendAsync', OPTIONS: 'SendAsync',
  };

  const methodCall = methodMap[request.method] || '';
  const contentArg = hasBody ? (isFormData ? ', formData' : ', content') : '';
  const isStandardShortcut = !!methodCall && methodCall !== 'SendAsync';

  if (isStandardShortcut) {
    lines.push(`var response = await client.${methodCall}("${csStr(url)}"${contentArg});`);
  } else {
    // Use HttpRequestMessage for HEAD, OPTIONS, and custom methods
    const knownMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
    const methodExpr = knownMethods.includes(request.method)
      ? `HttpMethod.${request.method.charAt(0) + request.method.slice(1).toLowerCase()}`
      : `new HttpMethod("${csStr(request.method)}")`;
    lines.push(`var request = new HttpRequestMessage(${methodExpr}, "${csStr(url)}");`);
    if (hasBody) {
      lines.push(`request.Content = ${isFormData ? 'formData' : 'content'};`);
    }
    lines.push('var response = await client.SendAsync(request);');
  }

  lines.push('');
  lines.push('var body = await response.Content.ReadAsStringAsync();');
  lines.push('Console.WriteLine($"Status: {response.StatusCode}");');
  lines.push('Console.WriteLine(body);');

  return lines.join('\n');
}

export const target: CodegenTarget = {
  id: 'csharp',
  label: 'C# - HttpClient',
  language: 'csharp',
  generate,
};
