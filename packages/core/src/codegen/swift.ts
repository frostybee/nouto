import { getUrlWithApiKey, getEffectiveHeaders, getBodyContent, getBasicAuth, getDigestAuth, getNtlmAuth, getAwsAuth, getProxy, getSsl, type CodegenRequest, type CodegenTarget } from './index';

/** Escape a string for use inside a Swift double-quoted string literal */
function swiftStr(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\t/g, '\\t');
}

function generate(request: CodegenRequest): string {
  const lines: string[] = [];
  const url = getUrlWithApiKey(request);
  const headers = getEffectiveHeaders(request);
  const basicAuth = getBasicAuth(request);
  const hasBody = ['POST', 'PUT', 'PATCH'].includes(request.method) && request.body.type !== 'none';

  lines.push('import Foundation');
  lines.push('');
  lines.push(`let url = URL(string: "${swiftStr(url)}")!`);
  lines.push('var request = URLRequest(url: url)');
  lines.push(`request.httpMethod = "${request.method}"`);

  for (const h of headers) {
    lines.push(`request.setValue("${swiftStr(h.value)}", forHTTPHeaderField: "${swiftStr(h.key)}")`);
  }

  if (basicAuth) {
    lines.push(`let credentials = "${swiftStr(basicAuth.username)}:${swiftStr(basicAuth.password)}".data(using: .utf8)!.base64EncodedString()`);
    lines.push('request.setValue("Basic \\(credentials)", forHTTPHeaderField: "Authorization")');
  }

  if (hasBody) {
    const body = getBodyContent(request);
    if (body) {
      lines.push(`request.httpBody = ${JSON.stringify(body)}.data(using: .utf8)`);
    }
  }

  // Digest auth
  const digestAuth = getDigestAuth(request);
  if (digestAuth) {
    lines.push('');
    lines.push('// Digest auth: use URLCredential with URLSession delegate');
    lines.push(`let credential = URLCredential(user: "${swiftStr(digestAuth.username)}", password: "${swiftStr(digestAuth.password)}", persistence: .forSession)`);
  }

  // NTLM auth
  const ntlmAuth = getNtlmAuth(request);
  if (ntlmAuth) {
    lines.push('');
    lines.push('// NTLM auth: use URLCredential with URLSession delegate');
    lines.push(`let credential = URLCredential(user: "${swiftStr(ntlmAuth.username)}", password: "${swiftStr(ntlmAuth.password)}", persistence: .forSession)`);
    if (ntlmAuth.domain) lines.push(`// Domain: "${swiftStr(ntlmAuth.domain)}"`);
  }

  // AWS SigV4
  const awsAuth = getAwsAuth(request);
  if (awsAuth) {
    lines.push('');
    lines.push('// AWS Signature V4 requires AWSSDKSwiftCore or manual signing');
    lines.push(`// Region: "${swiftStr(awsAuth.region)}", Service: "${swiftStr(awsAuth.service)}"`);
  }

  // Proxy / SSL
  const proxy = getProxy(request);
  const ssl = getSsl(request);

  lines.push('');
  if (proxy || ssl) {
    lines.push('let config = URLSessionConfiguration.default');
    if (proxy) {
      lines.push('config.connectionProxyDictionary = [');
      lines.push(`    kCFNetworkProxiesHTTPEnable as String: true,`);
      lines.push(`    kCFNetworkProxiesHTTPProxy as String: "${swiftStr(proxy.host)}",`);
      lines.push(`    kCFNetworkProxiesHTTPPort as String: ${proxy.port},`);
      lines.push(']');
    }
    if (ssl) {
      lines.push('// SSL: configure URLSession delegate for custom certificate handling');
      if (ssl.rejectUnauthorized === false) {
        lines.push('// Implement urlSession(_:didReceive:completionHandler:) to trust all certificates');
      }
    }
    lines.push('let session = URLSession(configuration: config)');
    lines.push('let (data, response) = try await session.data(for: request)');
  } else {
    lines.push('let (data, response) = try await URLSession.shared.data(for: request)');
  }
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
