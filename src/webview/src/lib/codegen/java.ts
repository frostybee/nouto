import { getUrlWithApiKey, getEffectiveHeaders, getBodyContent, getBasicAuth, type CodegenRequest, type CodegenTarget } from './index';

/** Escape a string for use inside a Java double-quoted string literal */
function javaStr(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\t/g, '\\t');
}

function generate(request: CodegenRequest): string {
  const lines: string[] = [];
  const url = getUrlWithApiKey(request);
  const headers = getEffectiveHeaders(request);
  const basicAuth = getBasicAuth(request);
  const hasBody = ['POST', 'PUT', 'PATCH'].includes(request.method) && request.body.type !== 'none';

  lines.push('import java.net.URI;');
  lines.push('import java.net.http.HttpClient;');
  lines.push('import java.net.http.HttpRequest;');
  lines.push('import java.net.http.HttpResponse;');
  if (basicAuth) lines.push('import java.util.Base64;');
  lines.push('');
  lines.push('HttpClient client = HttpClient.newHttpClient();');
  lines.push('');

  lines.push('HttpRequest request = HttpRequest.newBuilder()');
  lines.push(`    .uri(URI.create("${javaStr(url)}"))`);

  for (const h of headers) {
    lines.push(`    .header("${javaStr(h.key)}", "${javaStr(h.value)}")`);
  }

  if (basicAuth) {
    lines.push(`    .header("Authorization", "Basic " + Base64.getEncoder().encodeToString("${javaStr(basicAuth.username)}:${javaStr(basicAuth.password)}".getBytes()))`);
  }

  if (hasBody) {
    const body = getBodyContent(request);
    if (body) {
      lines.push(`    .method("${request.method}", HttpRequest.BodyPublishers.ofString(${JSON.stringify(body)}))`);
    } else {
      lines.push(`    .method("${request.method}", HttpRequest.BodyPublishers.noBody())`);
    }
  } else {
    if (request.method === 'GET') {
      lines.push('    .GET()');
    } else if (request.method === 'DELETE') {
      lines.push('    .DELETE()');
    } else {
      lines.push(`    .method("${request.method}", HttpRequest.BodyPublishers.noBody())`);
    }
  }

  lines.push('    .build();');
  lines.push('');
  lines.push('HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());');
  lines.push('');
  lines.push('System.out.println(response.statusCode());');
  lines.push('System.out.println(response.body());');

  return lines.join('\n');
}

export const target: CodegenTarget = {
  id: 'java',
  label: 'Java - HttpClient',
  language: 'java',
  generate,
};
