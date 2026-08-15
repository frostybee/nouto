/**
 * Input-shaping half of the contract generator: URL splitting, path
 * templating, param/variable/body normalization, and response-sample
 * grouping. Everything here turns raw collection/HAR material into the
 * NormalizedOperation fields the renderer consumes.
 */
import type { EnvironmentVariable, KeyValue, PathParam, SavedRequest } from '../../../types';
import { decodeHarContent } from '../../harParsing';
import type { HarEntry } from '../../harParsing';
import { classifyPathSegment } from '../specNaming';
import type { NormalizedBody, NormalizedParam, NormalizedResponseGroup } from '../types';

// --------------------------------------------------------------------------
// URL handling
// --------------------------------------------------------------------------

/** Methods with a fixed operation key in OpenAPI 3.1 (`query` is 3.2-only). */
export const EXPORTABLE_METHODS = new Set([
  'get',
  'put',
  'post',
  'delete',
  'options',
  'head',
  'patch',
  'trace',
]);

/** Headers that are never parameters (the spec reserves the first three). */
export const IGNORED_HEADER_PARAMS = new Set(['content-type', 'accept', 'authorization', 'cookie']);

/** Browser/transport noise recorded in HARs that would pollute a contract. */
export const IGNORED_HAR_HEADERS = new Set([
  ...IGNORED_HEADER_PARAMS,
  'accept-encoding',
  'accept-language',
  'cache-control',
  'connection',
  'content-length',
  'dnt',
  'host',
  'if-modified-since',
  'if-none-match',
  'origin',
  'pragma',
  'priority',
  'referer',
  'te',
  'upgrade-insecure-requests',
  'user-agent',
]);

interface SplitUrl {
  server?: { url: string };
  pathname: string;
  embeddedQuery: NormalizedParam[];
}

/**
 * Splits a (possibly variable-templated or scheme-less) URL into an origin
 * server, a pathname, and any query params embedded in the URL string.
 */
export function splitUrl(url: string, warnings: string[]): SplitUrl {
  const bare = url.split(/[?#]/)[0];
  const queryText = url.includes('?') ? url.slice(url.indexOf('?') + 1).split('#')[0] : '';
  const embeddedQuery = parseQueryText(queryText);

  if (bare.startsWith('/')) {
    return { pathname: bare, embeddedQuery };
  }

  // Second candidate covers scheme-less URLs like `localhost:3000/users`.
  for (const candidate of [bare, `http://${bare}`]) {
    try {
      const parsed = new URL(candidate);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') continue;
      if (!parsed.hostname || parsed.hostname.includes('{')) break;
      return {
        server: { url: parsed.origin },
        pathname: parsed.pathname,
        embeddedQuery,
      };
    } catch {
      // Try the next candidate, then fall through to the template handling.
    }
  }
  if (bare.includes('{')) {
    // e.g. `{{baseUrl}}/users` — the host is a template we cannot resolve.
    warnings.push('server omitted: URL host contains an unresolved variable');
    const slash = bare.indexOf('/');
    return { pathname: slash >= 0 ? bare.slice(slash) : '/', embeddedQuery };
  }
  warnings.push(`server omitted: URL could not be parsed (${bare || 'empty URL'})`);
  return { pathname: bare.startsWith('/') ? bare : `/${bare}`, embeddedQuery };
}

function parseQueryText(queryText: string): NormalizedParam[] {
  if (!queryText) return [];
  try {
    return [...new URLSearchParams(queryText).entries()].map(([name, value]) => ({
      name,
      required: true,
      example: value || undefined,
    }));
  } catch {
    return [];
  }
}

// --------------------------------------------------------------------------
// Path templating
// --------------------------------------------------------------------------

/**
 * Templates a concrete pathname into an OpenAPI path. Numeric/UUID segments
 * become `{param}` placeholders named after their preceding static segment
 * (`/orgs/7/users/42` → `/orgs/{orgId}/users/{userId}`); template segments
 * already present in the source (`{id}`, `{{var}}`, `:id`) are normalized to
 * OpenAPI style. Param names are unique within the path (spec requirement).
 */
export function templatePath(
  pathname: string,
  pathParamRows?: PathParam[]
): { path: string; params: NormalizedParam[] } {
  const segments = pathname.split('/').filter(Boolean);
  const params: NormalizedParam[] = [];
  const usedNames = new Set<string>();
  const out: string[] = [];
  let lastStatic: string | undefined;

  for (const rawSegment of segments) {
    // `new URL()` percent-encodes braces in pathnames (`{id}` → `%7Bid%7D`) —
    // decode so template segments classify as params, not static text.
    let segment = rawSegment;
    try {
      segment = decodeURIComponent(rawSegment);
    } catch {
      // Malformed escape — classify the raw segment.
    }
    const cls = classifyPathSegment(segment);
    if (cls === 'static' || cls === 'version') {
      out.push(segment);
      if (cls === 'static') lastStatic = segment;
      continue;
    }

    let name: string;
    let example: string | undefined;
    if (cls === 'param') {
      name = sanitizeParamName(segment.replace(/^[{:]+|[}]+$/g, ''));
    } else {
      name = lastStatic ? idParamName(lastStatic) : 'id';
      example = segment;
    }
    name = uniqueName(name, usedNames);
    usedNames.add(name);

    const row = pathParamRows?.find((r) => r.key === name || `{${r.key}}` === segment);
    params.push({
      name,
      required: true,
      example: row?.value || example,
      description: row?.description || undefined,
    });
    out.push(`{${name}}`);
  }

  return { path: `/${out.join('/')}` || '/', params };
}

function sanitizeParamName(raw: string): string {
  const cleaned = raw.replace(/[^A-Za-z0-9_]/g, '');
  return cleaned && !/^\d/.test(cleaned) ? cleaned : 'param';
}

/** `user-profiles` → `userProfileId`, `orders` → `orderId`. */
function idParamName(staticSegment: string): string {
  const words = staticSegment.split(/[-_.\s]+/).filter(Boolean).map((w) => w.replace(/[^A-Za-z0-9]/g, ''));
  if (!words.length) return 'id';
  words[words.length - 1] = singularize(words[words.length - 1]);
  const camel = words
    .map((word, i) => (i === 0 ? word.toLowerCase() : word[0].toUpperCase() + word.slice(1).toLowerCase()))
    .join('');
  return camel && !/^\d/.test(camel) ? `${camel}Id` : 'id';
}

function singularize(word: string): string {
  if (/ies$/i.test(word) && word.length > 3) return `${word.slice(0, -3)}y`;
  if (/(ss|us|is)$/i.test(word)) return word;
  if (/s$/i.test(word) && word.length > 1) return word.slice(0, -1);
  return word;
}

export function uniqueName(base: string, used: Set<string>): string {
  if (!used.has(base)) return base;
  let counter = 2;
  while (used.has(`${base}${counter}`)) counter++;
  return `${base}${counter}`;
}

// --------------------------------------------------------------------------
// Params, variables, bodies
// --------------------------------------------------------------------------

export function toVariableMap(variables: EnvironmentVariable[]): Map<string, string> {
  return new Map(variables.map((v) => [v.key, v.value]));
}

/** Replaces `{{name}}` with known variable values; unknown names stay put. */
export function substituteVariables(text: string, variables: Map<string, string>): string {
  if (!text.includes('{{')) return text;
  return text.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (match, name: string) =>
    variables.has(name) ? variables.get(name)! : match
  );
}

export function keyValueToParam(kv: KeyValue, variables: Map<string, string>): NormalizedParam {
  return {
    name: kv.key,
    required: kv.enabled !== false,
    example: kv.value ? substituteVariables(kv.value, variables) : undefined,
    description: kv.description || undefined,
  };
}

export function dedupeParams(params: NormalizedParam[]): NormalizedParam[] {
  const seen = new Map<string, NormalizedParam>();
  for (const param of params) {
    if (param.name && !seen.has(param.name)) seen.set(param.name, param);
  }
  return [...seen.values()];
}

/** Accepts both the canonical `{key, fieldType}` and HAR-legacy `{name, type}` row shapes. */
export function parseFormFields(content: string): { fields: Record<string, string>; fileFields: string[] } {
  const fields: Record<string, string> = {};
  const fileFields: string[] = [];
  if (!content) return { fields, fileFields };
  try {
    const rows = JSON.parse(content);
    if (!Array.isArray(rows)) return { fields, fileFields };
    for (const row of rows) {
      const key = row?.key ?? row?.name;
      if (!key || row?.enabled === false) continue;
      fields[key] = String(row.value ?? '');
      if ((row.fieldType ?? row.type) === 'file') fileFields.push(key);
    }
  } catch {
    // Not the expected JSON row shape — export the body without fields.
  }
  return { fields, fileFields };
}

export function harBody(
  postData: HarEntry['request']['postData'],
  warnings: string[]
): NormalizedBody | undefined {
  if (!postData) return undefined;
  const mime = (postData.mimeType || '').split(';')[0].trim().toLowerCase();

  if (mime.includes('multipart/form-data')) {
    const fields: Record<string, string> = {};
    for (const param of postData.params ?? []) {
      if (param.name) fields[param.name] = param.value ?? '';
    }
    return { contentType: 'multipart/form-data', samples: Object.keys(fields).length ? [fields] : [] };
  }
  if (!postData.text) return undefined;
  if (mime.includes('json')) {
    try {
      return { contentType: 'application/json', samples: [JSON.parse(postData.text)] };
    } catch {
      warnings.push('request body is not valid JSON; exported without a schema');
      return { contentType: 'application/json', samples: [], rawExampleText: postData.text };
    }
  }
  if (mime.includes('x-www-form-urlencoded')) {
    const fields: Record<string, string> = {};
    try {
      for (const [key, value] of new URLSearchParams(postData.text)) fields[key] = value;
    } catch {
      // Unparseable — export without fields.
    }
    return {
      contentType: 'application/x-www-form-urlencoded',
      samples: Object.keys(fields).length ? [fields] : [],
    };
  }
  return {
    contentType: mime || 'text/plain',
    samples: [],
    rawExampleText: postData.text,
  };
}

// --------------------------------------------------------------------------
// Responses
// --------------------------------------------------------------------------

/** Cap on merged samples per status group — keeps inference bounded on large HARs. */
export const MAX_SAMPLES_PER_GROUP = 10;

export function responsesFromExamples(request: SavedRequest): NormalizedResponseGroup[] {
  const groups: NormalizedResponseGroup[] = [];
  for (const example of request.examples ?? []) {
    if (!example || typeof example.status !== 'number' || example.status < 100) continue;
    let sample: unknown = example.body;
    if (typeof sample === 'string') {
      try {
        sample = JSON.parse(sample);
      } catch {
        sample = undefined;
      }
    }
    const contentTypeHeader = Object.entries(example.headers ?? {}).find(
      ([key]) => key.toLowerCase() === 'content-type'
    )?.[1];
    const contentType = contentTypeHeader?.split(';')[0].trim() || (sample !== undefined ? 'application/json' : undefined);
    addResponseSample(groups, example.status, contentType, sample, example.statusText || undefined);
  }
  return groups;
}

export function harResponses(entry: HarEntry): NormalizedResponseGroup[] {
  const response = entry.response;
  if (!response || typeof response.status !== 'number' || response.status < 100) return [];
  const { json } = decodeHarContent(response.content);
  const contentType = response.content?.mimeType?.split(';')[0].trim() || undefined;
  const groups: NormalizedResponseGroup[] = [];
  addResponseSample(groups, response.status, contentType, json, response.statusText || undefined);
  return groups;
}

export function addResponseSample(
  groups: NormalizedResponseGroup[],
  status: number | 'default',
  contentType: string | undefined,
  sample: unknown,
  description: string | undefined
): void {
  let group = groups.find((g) => g.status === status);
  if (!group) {
    group = { status, description, contentType, samples: [] };
    groups.push(group);
  }
  group.contentType ??= contentType;
  group.description ??= description;
  if (sample !== undefined && group.samples.length < MAX_SAMPLES_PER_GROUP) {
    group.samples.push(sample);
  }
}
