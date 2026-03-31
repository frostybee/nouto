import { getUrlWithApiKey, getEffectiveHeaders, getBodyContent, getBasicAuth, getDigestAuth, getNtlmAuth, getAwsAuth, getProxy, getSsl, type CodegenRequest, type CodegenTarget } from './index';

/** Escape a string for use inside a Dart single-quoted string literal */
function dartStr(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\t/g, '\\t');
}

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
  lines.push(`  final url = Uri.parse('${dartStr(url)}');`);

  if (headers.length > 0 || basicAuth) {
    lines.push('  final headers = {');
    for (const h of headers) {
      lines.push(`    '${dartStr(h.key)}': '${dartStr(h.value)}',`);
    }
    if (basicAuth) {
      lines.push(`    'Authorization': 'Basic \${base64Encode(utf8.encode('${dartStr(basicAuth.username)}:${dartStr(basicAuth.password)}'))}',`);
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

  // Digest auth
  const digestAuth = getDigestAuth(request);
  if (digestAuth) {
    lines.push('');
    lines.push('  // Digest auth requires a package like http_auth');
    lines.push(`  // Username: '${dartStr(digestAuth.username)}', Password: '${dartStr(digestAuth.password)}'`);
  }

  // NTLM auth
  const ntlmAuth = getNtlmAuth(request);
  if (ntlmAuth) {
    lines.push('');
    lines.push('  // NTLM auth requires a package like enough_mail');
    lines.push(`  // Username: '${dartStr(ntlmAuth.username)}', Domain: '${dartStr(ntlmAuth.domain)}'`);
  }

  // AWS SigV4
  const awsAuth = getAwsAuth(request);
  if (awsAuth) {
    lines.push('');
    lines.push('  // AWS Signature V4 requires package:aws_signature_v4');
    lines.push(`  // Region: '${dartStr(awsAuth.region)}', Service: '${dartStr(awsAuth.service)}'`);
  }

  // Proxy
  const proxy = getProxy(request);
  if (proxy) {
    lines.push('');
    lines.push('  // Proxy: use HttpClient (dart:io) with findProxy');
    lines.push(`  // HttpClient()..findProxy = (_) => 'PROXY ${dartStr(proxy.host)}:${proxy.port}';`);
  }

  // SSL
  const ssl = getSsl(request);
  if (ssl) {
    lines.push('');
    lines.push('  // SSL: use SecurityContext with HttpClient (dart:io)');
    if (ssl.rejectUnauthorized === false) lines.push('  // HttpClient()..badCertificateCallback = (cert, host, port) => true;');
    if (ssl.certPath) lines.push(`  // SecurityContext()..useCertificateChain('${dartStr(ssl.certPath)}');`);
    if (ssl.keyPath) lines.push(`  // SecurityContext()..usePrivateKey('${dartStr(ssl.keyPath)}');`);
  }

  lines.push('}');

  return lines.join('\n');
}

export const target: CodegenTarget = {
  id: 'dart',
  label: 'Dart - http',
  language: 'dart',
  generate,
};
