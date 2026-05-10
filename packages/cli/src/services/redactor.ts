const SENSITIVE_HEADERS = new Set([
  'authorization',
  'x-api-key',
  'cookie',
  'set-cookie',
  'proxy-authorization',
  'x-auth-token',
]);

const BEARER_PATTERN = /^Bearer\s+.+$/i;
const BASIC_PATTERN = /^Basic\s+.+$/i;
const JWT_PATTERN = /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

function maskValue(value: string): string {
  if (value.length <= 8) return '***';
  return value.slice(0, 4) + '***' + value.slice(-4);
}

function isSensitiveValue(value: string): boolean {
  return BEARER_PATTERN.test(value) || BASIC_PATTERN.test(value) || JWT_PATTERN.test(value);
}

export function redactHeaders(headers: Record<string, string> | undefined): Record<string, string> | undefined {
  if (!headers) return headers;
  const redacted: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (SENSITIVE_HEADERS.has(key.toLowerCase())) {
      redacted[key] = maskValue(value);
    } else if (isSensitiveValue(value)) {
      redacted[key] = maskValue(value);
    } else {
      redacted[key] = value;
    }
  }
  return redacted;
}

export function redactReportResults(results: any[]): void {
  for (const r of results) {
    if (r.requestHeaders) {
      r.requestHeaders = redactHeaders(r.requestHeaders);
    }
    if (r.responseHeaders) {
      r.responseHeaders = redactHeaders(r.responseHeaders);
    }
  }
}
