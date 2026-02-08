import { getUrlWithApiKey, getEffectiveHeaders, getBodyContent, getBasicAuth, type CodegenRequest, type CodegenTarget } from './index';

function generate(request: CodegenRequest): string {
  const lines: string[] = [];
  const url = getUrlWithApiKey(request);
  const headers = getEffectiveHeaders(request);
  const basicAuth = getBasicAuth(request);
  const hasBody = ['POST', 'PUT', 'PATCH'].includes(request.method) && request.body.type !== 'none';

  lines.push('import Foundation');
  lines.push('');
  lines.push(`let url = URL(string: "${url}")!`);
  lines.push('var request = URLRequest(url: url)');
  lines.push(`request.httpMethod = "${request.method}"`);

  for (const h of headers) {
    lines.push(`request.setValue("${h.value}", forHTTPHeaderField: "${h.key}")`);
  }

  if (basicAuth) {
    lines.push(`let credentials = "${basicAuth.username}:${basicAuth.password}".data(using: .utf8)!.base64EncodedString()`);
    lines.push('request.setValue("Basic \\(credentials)", forHTTPHeaderField: "Authorization")');
  }

  if (hasBody) {
    const body = getBodyContent(request);
    if (body) {
      lines.push(`request.httpBody = ${JSON.stringify(body)}.data(using: .utf8)`);
    }
  }

  lines.push('');
  lines.push('let (data, response) = try await URLSession.shared.data(for: request)');
  lines.push('let httpResponse = response as! HTTPURLResponse');
  lines.push('print("Status: \\(httpResponse.statusCode)")');
  lines.push('print(String(data: data, encoding: .utf8) ?? "")');

  return lines.join('\n');
}

export const target: CodegenTarget = {
  id: 'swift',
  label: 'Swift - URLSession',
  language: 'swift',
  generate,
};
