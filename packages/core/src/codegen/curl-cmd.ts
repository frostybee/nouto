import { buildCurlCommand, type CurlDialect } from './curl';
import type { CodegenRequest, CodegenTarget } from './index';

/**
 * Quote an argument for curl.exe in cmd.exe.
 *
 * cmd.exe has no single quotes. Arguments go in double quotes, and curl.exe
 * (a C runtime program) reads `\"` as a literal quote, with the backslashes
 * before a quote doubled. Other characters are literal inside double quotes,
 * apart from `%`, which cmd.exe expands as an environment variable.
 */
export function cmdQuote(value: string): string {
  if (/^[a-zA-Z0-9_./:@=]+$/.test(value) && !value.startsWith('-')) return value;
  const escaped = value
    .replace(/(\\*)"/g, (_m, backslashes: string) => backslashes + backslashes + '\\"')
    .replace(/(\\+)$/, (_m, backslashes: string) => backslashes + backslashes);
  return '"' + escaped + '"';
}

/** A quoted argument cannot span lines in cmd.exe, so a JSON body is written on one line */
function prepareBody(body: string): string {
  if (!/[\r\n]/.test(body)) return body;
  try {
    return JSON.stringify(JSON.parse(body));
  } catch {
    return body.replace(/\r?\n\s*/g, ' ');
  }
}

export const cmdDialect: CurlDialect = {
  quote: cmdQuote,
  lineJoin: ' ^\n  ',
  prepareBody,
};

function generate(request: CodegenRequest): string {
  return buildCurlCommand(request, cmdDialect);
}

export const target: CodegenTarget = {
  id: 'curl-cmd',
  label: 'cURL (cmd.exe)',
  language: 'bat',
  generate,
};
