import { parseHarEntries, decodeHarContent } from './harParsing';
import type { HarEntry } from './harParsing';

const makeEntry = (overrides: Partial<HarEntry['request']> = {}, response?: HarEntry['response']): HarEntry => ({
  request: {
    method: 'GET',
    url: 'https://api.example.com/users',
    headers: [],
    queryString: [],
    ...overrides,
  },
  ...(response ? { response } : {}),
});

const makeHar = (entries: HarEntry[]): string => JSON.stringify({ log: { entries } });

describe('parseHarEntries', () => {
  it('returns the entries of a valid HAR', () => {
    const { entries } = parseHarEntries(makeHar([makeEntry()]));
    expect(entries).toHaveLength(1);
    expect(entries[0].request.url).toBe('https://api.example.com/users');
  });

  it('preserves response data when present', () => {
    const { entries } = parseHarEntries(
      makeHar([
        makeEntry({}, { status: 200, content: { mimeType: 'application/json', text: '{"a":1}' } }),
      ])
    );
    expect(entries[0].response).toEqual({
      status: 200,
      content: { mimeType: 'application/json', text: '{"a":1}' },
    });
  });

  it('tolerates entries without a response', () => {
    const { entries } = parseHarEntries(makeHar([makeEntry()]));
    expect(entries[0].response).toBeUndefined();
  });

  it('throws on invalid JSON with the established message', () => {
    expect(() => parseHarEntries('not json')).toThrow('Invalid HAR file: content is not valid JSON');
  });

  it.each<[string, string]>([
    ['no log', '{}'],
    ['no entries', '{"log":{}}'],
    ['entries not an array', '{"log":{"entries":42}}'],
  ])('throws on %s with the established message', (_label, content) => {
    expect(() => parseHarEntries(content)).toThrow('Invalid HAR file: missing log.entries array');
  });
});

describe('decodeHarContent', () => {
  it('returns empty for missing content or text', () => {
    expect(decodeHarContent(undefined)).toEqual({});
    expect(decodeHarContent({ mimeType: 'application/json' })).toEqual({});
  });

  it('parses declared JSON', () => {
    expect(decodeHarContent({ mimeType: 'application/json', text: '{"a":1}' })).toEqual({
      text: '{"a":1}',
      json: { a: 1 },
    });
  });

  it('parses JSON-shaped text even without a json mime type', () => {
    expect(decodeHarContent({ mimeType: 'text/plain', text: '[1,2]' })).toEqual({
      text: '[1,2]',
      json: [1, 2],
    });
  });

  it('decodes base64 and parses the result as JSON', () => {
    const encoded = Buffer.from('{"token":"abc"}', 'utf-8').toString('base64');
    expect(decodeHarContent({ mimeType: 'application/json', text: encoded, encoding: 'base64' })).toEqual({
      text: '{"token":"abc"}',
      json: { token: 'abc' },
    });
  });

  it('falls back to text for base64 that is not JSON', () => {
    const encoded = Buffer.from('hello world', 'utf-8').toString('base64');
    expect(decodeHarContent({ mimeType: 'text/plain', text: encoded, encoding: 'base64' })).toEqual({
      text: 'hello world',
    });
  });

  it('returns text without json for declared JSON that does not parse', () => {
    expect(decodeHarContent({ mimeType: 'application/json', text: '{oops' })).toEqual({
      text: '{oops',
    });
  });
});
