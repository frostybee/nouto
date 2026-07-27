/**
 * Shared HAR 1.2 parsing (simplified) — one code path for every HAR consumer:
 * HarImportService builds a Collection from `entry.request`, while the
 * Collections/HAR → OpenAPI generator also reads `entry.response` to infer
 * response schemas.
 */

export interface HarRequest {
  method: string;
  url: string;
  headers: Array<{ name: string; value: string }>;
  queryString: Array<{ name: string; value: string }>;
  postData?: {
    mimeType?: string;
    text?: string;
    params?: Array<{ name: string; value: string }>;
  };
}

export interface HarResponseContent {
  mimeType?: string;
  text?: string;
  /** HAR encodes binary bodies as `'base64'`; absent means literal text. */
  encoding?: string;
}

export interface HarResponse {
  status: number;
  statusText?: string;
  headers?: Array<{ name: string; value: string }>;
  content?: HarResponseContent;
}

export interface HarEntry {
  request: HarRequest;
  response?: HarResponse;
}

export interface HarLog {
  log: {
    version?: string;
    entries: HarEntry[];
  };
}

/**
 * Parses and validates a HAR file. Error messages are part of the public
 * surface — HarImportService rethrows them verbatim.
 */
export function parseHarEntries(content: string): { entries: HarEntry[] } {
  let data: HarLog;
  try {
    data = JSON.parse(content);
  } catch {
    throw new Error('Invalid HAR file: content is not valid JSON');
  }

  if (!data.log?.entries || !Array.isArray(data.log.entries)) {
    throw new Error('Invalid HAR file: missing log.entries array');
  }

  return { entries: data.log.entries };
}

/**
 * Decodes a HAR response body: base64 is unwrapped when declared (some
 * proxies base64-encode everything, including JSON), then a JSON parse is
 * attempted when the mime type or the text shape suggests it. Never throws —
 * `json` is undefined when the body isn't parseable JSON, and both fields are
 * undefined when decoding fails outright.
 */
export function decodeHarContent(
  content?: HarResponseContent
): { text?: string; json?: unknown } {
  if (!content?.text) return {};

  let text = content.text;
  if (content.encoding === 'base64') {
    try {
      text = Buffer.from(text, 'base64').toString('utf-8');
    } catch {
      return {};
    }
  }

  const mime = (content.mimeType || '').toLowerCase();
  const looksJson = /^\s*[{[]/.test(text);
  if (mime.includes('json') || looksJson) {
    try {
      return { text, json: JSON.parse(text) };
    } catch {
      // Fall through — declared JSON that doesn't parse is still text.
    }
  }
  return { text };
}
