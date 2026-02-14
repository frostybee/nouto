import { getUrlWithApiKey, getEffectiveHeaders, getBodyContent, getFormDataItems, getBasicAuth, type CodegenRequest, type CodegenTarget } from './index';

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

  lines.push('using System.Net.Http;');
  lines.push('using System.Net.Http.Headers;');
  if (request.body.type === 'json') lines.push('using System.Text;');
  lines.push('');
  lines.push('using var client = new HttpClient();');

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

  const methodCall = methodMap[request.method] || 'SendAsync';
  const contentArg = hasBody ? (isFormData ? ', formData' : ', content') : '';

  if (['HEAD', 'OPTIONS'].includes(request.method)) {
    lines.push(`var request = new HttpRequestMessage(HttpMethod.${request.method.charAt(0) + request.method.slice(1).toLowerCase()}, "${csStr(url)}");`);
    lines.push('var response = await client.SendAsync(request);');
  } else {
    lines.push(`var response = await client.${methodCall}("${csStr(url)}"${contentArg});`);
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
