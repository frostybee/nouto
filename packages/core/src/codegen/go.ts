import { getUrlWithApiKey, getEffectiveHeaders, getBodyContent, getBasicAuth, getDigestAuth, getNtlmAuth, getAwsAuth, getProxy, getSsl, type CodegenRequest, type CodegenTarget } from './index';

/** Escape a string for use inside a Go double-quoted string literal */
function goStr(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\t/g, '\\t');
}

function generate(request: CodegenRequest): string {
  const lines: string[] = [];
  const url = getUrlWithApiKey(request);
  const headers = getEffectiveHeaders(request);
  const basicAuth = getBasicAuth(request);
  const hasBody = ['POST', 'PUT', 'PATCH'].includes(request.method) && request.body.type !== 'none';

  const needsProxy = !!getProxy(request);
  const needsSsl = !!getSsl(request);
  const needsTransport = needsProxy || needsSsl;

  lines.push('package main');
  lines.push('');
  lines.push('import (');
  if (needsSsl) lines.push('\t"crypto/tls"');
  lines.push('\t"fmt"');
  lines.push('\t"io"');
  lines.push('\t"net/http"');
  if (needsProxy) lines.push('\t"net/url"');
  if (hasBody) lines.push('\t"strings"');
  lines.push(')');
  lines.push('');
  lines.push('func main() {');

  if (hasBody) {
    const body = getBodyContent(request);
    if (body) {
      lines.push(`\tbody := strings.NewReader(${JSON.stringify(body)})`);
    } else {
      lines.push('\tvar body io.Reader');
    }
    lines.push('');
    lines.push(`\treq, err := http.NewRequest("${request.method}", "${goStr(url)}", body)`);
  } else {
    lines.push(`\treq, err := http.NewRequest("${request.method}", "${goStr(url)}", nil)`);
  }

  lines.push('\tif err != nil {');
  lines.push('\t\tpanic(err)');
  lines.push('\t}');
  lines.push('');

  for (const h of headers) {
    lines.push(`\treq.Header.Set("${goStr(h.key)}", "${goStr(h.value)}")`);
  }

  if (basicAuth) {
    lines.push(`\treq.SetBasicAuth("${goStr(basicAuth.username)}", "${goStr(basicAuth.password)}")`);
  }

  // Digest auth
  const digestAuth = getDigestAuth(request);
  if (digestAuth) {
    lines.push('');
    lines.push('\t// Digest auth requires a third-party library (e.g., github.com/icholy/digest)');
    lines.push(`\t// Username: "${goStr(digestAuth.username)}", Password: "${goStr(digestAuth.password)}"`);
  }

  // NTLM auth
  const ntlmAuth = getNtlmAuth(request);
  if (ntlmAuth) {
    lines.push('');
    lines.push('\t// NTLM auth requires a third-party library (e.g., github.com/Azure/go-ntlmssp)');
    lines.push(`\t// Username: "${goStr(ntlmAuth.username)}", Domain: "${goStr(ntlmAuth.domain)}"`);
  }

  // AWS SigV4
  const awsAuth = getAwsAuth(request);
  if (awsAuth) {
    lines.push('');
    lines.push('\t// AWS Signature V4 requires github.com/aws/aws-sdk-go-v2');
    lines.push(`\t// Region: "${goStr(awsAuth.region)}", Service: "${goStr(awsAuth.service)}"`);
  }

  // Transport / proxy / TLS
  const proxy = getProxy(request);
  const ssl = getSsl(request);

  lines.push('');
  if (proxy || ssl) {
    if (ssl) {
      lines.push('\ttlsConfig := &tls.Config{');
      if (ssl.rejectUnauthorized === false) lines.push('\t\tInsecureSkipVerify: true,');
      lines.push('\t}');
      if (ssl.certPath && ssl.keyPath) {
        lines.push(`\tcert, _ := tls.LoadX509KeyPair("${goStr(ssl.certPath)}", "${goStr(ssl.keyPath)}")`);
        lines.push('\ttlsConfig.Certificates = []tls.Certificate{cert}');
      }
    }
    lines.push('\ttransport := &http.Transport{');
    if (proxy) {
      lines.push(`\t\tProxy: http.ProxyURL(&url.URL{Scheme: "${proxy.protocol}", Host: "${goStr(proxy.host)}:${proxy.port}"}),`);
    }
    if (ssl) {
      lines.push('\t\tTLSClientConfig: tlsConfig,');
    }
    lines.push('\t}');
    lines.push('\tclient := &http.Client{Transport: transport}');
  } else {
    lines.push('\tclient := &http.Client{}');
  }
  lines.push('\tresp, err := client.Do(req)');
  lines.push('\tif err != nil {');
  lines.push('\t\tpanic(err)');
  lines.push('\t}');
  lines.push('\tdefer resp.Body.Close()');
  lines.push('');
  lines.push('\trespBody, _ := io.ReadAll(resp.Body)');
  lines.push('\tfmt.Println(resp.Status)');
  lines.push('\tfmt.Println(string(respBody))');
  lines.push('}');

  return lines.join('\n');
}

export const target: CodegenTarget = {
  id: 'go',
  label: 'Go - net/http',
  language: 'go',
  generate,
};
