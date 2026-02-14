import { getUrlWithApiKey, getEffectiveHeaders, getBodyContent, getBasicAuth, type CodegenRequest, type CodegenTarget } from './index';

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

  lines.push('package main');
  lines.push('');
  lines.push('import (');
  lines.push('\t"fmt"');
  lines.push('\t"io"');
  lines.push('\t"net/http"');
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

  lines.push('');
  lines.push('\tclient := &http.Client{}');
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
