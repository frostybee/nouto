import { getUrlWithApiKey, getEffectiveHeaders, getBodyContent, getBasicAuth, type CodegenRequest, type CodegenTarget } from './index';

function generate(request: CodegenRequest): string {
  const lines: string[] = [];
  const url = getUrlWithApiKey(request);
  const headers = getEffectiveHeaders(request);
  const basicAuth = getBasicAuth(request);
  const hasBody = ['POST', 'PUT', 'PATCH'].includes(request.method) && request.body.type !== 'none';

  lines.push("import 'dart:convert';");
  lines.push("import 'package:http/http.dart' as http;");
  lines.push('');
  lines.push('void main() async {');
  lines.push(`  final url = Uri.parse('${url}');`);

  if (headers.length > 0 || basicAuth) {
    lines.push('  final headers = {');
    for (const h of headers) {
      lines.push(`    '${h.key}': '${h.value}',`);
    }
    if (basicAuth) {
      lines.push(`    'Authorization': 'Basic \${base64Encode(utf8.encode('${basicAuth.username}:${basicAuth.password}'))}',`);
    }
    lines.push('  };');
  }

  const method = request.method.toLowerCase();

  if (hasBody) {
    const body = getBodyContent(request);
    if (body && request.body.type === 'json') {
      try {
        JSON.parse(body);
        lines.push(`  final body = jsonEncode(${body});`);
      } catch {
        lines.push(`  final body = ${JSON.stringify(body)};`);
      }
    } else if (body) {
      lines.push(`  final body = ${JSON.stringify(body)};`);
    }
  }

  lines.push('');
  const headerArg = (headers.length > 0 || basicAuth) ? ', headers: headers' : '';
  const bodyArg = hasBody ? ', body: body' : '';

  lines.push(`  final response = await http.${method}(url${headerArg}${bodyArg});`);
  lines.push('');
  lines.push("  print('Status: \${response.statusCode}');");
  lines.push('  print(response.body);');
  lines.push('}');

  return lines.join('\n');
}

export const target: CodegenTarget = {
  id: 'dart',
  label: 'Dart - http',
  language: 'dart',
  generate,
};
