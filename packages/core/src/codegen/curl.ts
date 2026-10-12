import { getUrlWithApiKey, getEffectiveHeaders, getBodyContent, getFormDataItems, getBasicAuth, getDigestAuth, getNtlmAuth, getAwsAuth, getProxy, getSsl, buildProxyUrl, type CodegenRequest, type CodegenTarget } from './index';

/** How a shell quotes arguments and continues a command on the next line */
export interface CurlDialect {
  quote: (value: string) => string;
  /** Joins the option lines, including the continuation character */
  lineJoin: string;
  /** Adjusts a request body before quoting, for shells that cannot quote across lines */
  prepareBody?: (body: string) => string;
}

function shellEscape(str: string): string {
  if (/^[a-zA-Z0-9_./:@=]+$/.test(str) && !str.startsWith('-')) return str;
  return "'" + str.replace(/'/g, "'\\''") + "'";
}

/** POSIX shells: bash, zsh, and Git Bash on Windows */
export const posixDialect: CurlDialect = {
  quote: shellEscape,
  lineJoin: ' \\\n  ',
};

export function buildCurlCommand(request: CodegenRequest, dialect: CurlDialect): string {
  const q = dialect.quote;
  const parts: string[] = ['curl'];
  // One line per option: a flag stays on the same line as its value
  const add = (...tokens: string[]) => parts.push(tokens.join(' '));

  if (request.method !== 'GET') {
    add('-X', request.method);
  }

  const fullUrl = getUrlWithApiKey(request);
  add(q(fullUrl));

  // Headers (skip auth-related, handled below)
  const headers = getEffectiveHeaders(request);
  for (const h of headers) {
    add('-H', q(`${h.key}: ${h.value}`));
  }

  // Basic auth
  const basicAuth = getBasicAuth(request);
  if (basicAuth) {
    add('-u', q(`${basicAuth.username}:${basicAuth.password}`));
  }

  // Digest auth
  const digestAuth = getDigestAuth(request);
  if (digestAuth) {
    add('--digest', '-u', q(`${digestAuth.username}:${digestAuth.password}`));
  }

  // NTLM auth
  const ntlmAuth = getNtlmAuth(request);
  if (ntlmAuth) {
    const user = ntlmAuth.domain ? `${ntlmAuth.domain}\\${ntlmAuth.username}` : ntlmAuth.username;
    add('--ntlm', '-u', q(`${user}:${ntlmAuth.password}`));
  }

  // AWS SigV4
  const awsAuth = getAwsAuth(request);
  if (awsAuth) {
    add('--aws-sigv4', q(`aws:amz:${awsAuth.region}:${awsAuth.service}`));
    add('-u', q(`${awsAuth.accessKey}:${awsAuth.secretKey}`));
    if (awsAuth.sessionToken) {
      add('-H', q(`X-Amz-Security-Token: ${awsAuth.sessionToken}`));
    }
  }

  // Proxy
  const proxy = getProxy(request);
  if (proxy) {
    add('--proxy', q(buildProxyUrl(proxy)));
  }

  // SSL
  const ssl = getSsl(request);
  if (ssl) {
    if (ssl.rejectUnauthorized === false) add('--insecure');
    if (ssl.certPath) add('--cert', q(ssl.certPath));
    if (ssl.keyPath) add('--key', q(ssl.keyPath));
    if (ssl.passphrase) add('--pass', q(ssl.passphrase));
  }

  // Body
  if (request.body.type === 'binary' && request.body.fileName) {
    add('--data-binary', `@${q(request.body.content || request.body.fileName)}`);
  } else if (request.body.type === 'form-data') {
    const items = getFormDataItems(request);
    for (const item of items) {
      if (item.fieldType === 'file' && item.fileName) {
        const mime = (item as any).fileMimeType ? `;type=${(item as any).fileMimeType}` : '';
        add('-F', q(`${item.key}=@${item.value}${mime}`));
      } else {
        // --form-string sends the value as text even when it starts with @ or <
        add('--form-string', q(`${item.key}=${item.value}`));
      }
    }
  } else {
    const body = getBodyContent(request);
    if (body) {
      // --data-raw sends the body as text even when it starts with @
      add('--data-raw', q(dialect.prepareBody ? dialect.prepareBody(body) : body));
    }
  }

  return parts.join(dialect.lineJoin);
}

function generate(request: CodegenRequest): string {
  return buildCurlCommand(request, posixDialect);
}

export const target: CodegenTarget = {
  id: 'curl',
  label: 'cURL',
  language: 'shellscript',
  generate,
};
