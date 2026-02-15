import { describe, it, expect } from 'vitest';
import { parseUrlParams, buildDisplayUrl, mergeParams } from '@hivefetch/core';

describe('parseUrlParams', () => {
  it('should return base URL and empty params when no query string', () => {
    const result = parseUrlParams('https://api.example.com/users');
    expect(result.baseUrl).toBe('https://api.example.com/users');
    expect(result.params).toHaveLength(0);
  });

  it('should parse a single param', () => {
    const result = parseUrlParams('https://api.com?page=2');
    expect(result.baseUrl).toBe('https://api.com');
    expect(result.params).toHaveLength(1);
    expect(result.params[0].key).toBe('page');
    expect(result.params[0].value).toBe('2');
    expect(result.params[0].enabled).toBe(true);
  });

  it('should parse multiple params', () => {
    const result = parseUrlParams('https://api.com?page=2&size=10');
    expect(result.baseUrl).toBe('https://api.com');
    expect(result.params).toHaveLength(2);
    expect(result.params[0].key).toBe('page');
    expect(result.params[0].value).toBe('2');
    expect(result.params[1].key).toBe('size');
    expect(result.params[1].value).toBe('10');
  });

  it('should handle duplicate keys', () => {
    const result = parseUrlParams('https://api.com?a=1&a=2');
    expect(result.params).toHaveLength(2);
    expect(result.params[0]).toMatchObject({ key: 'a', value: '1' });
    expect(result.params[1]).toMatchObject({ key: 'a', value: '2' });
  });

  it('should split on first = only (value with = in it)', () => {
    const result = parseUrlParams('https://api.com?q=a=b');
    expect(result.params).toHaveLength(1);
    expect(result.params[0].key).toBe('q');
    expect(result.params[0].value).toBe('a=b');
  });

  it('should handle key with no value (no =)', () => {
    const result = parseUrlParams('https://api.com?key');
    expect(result.params).toHaveLength(1);
    expect(result.params[0].key).toBe('key');
    expect(result.params[0].value).toBe('');
  });

  it('should return empty params for trailing ? with nothing after', () => {
    const result = parseUrlParams('https://api.com?');
    expect(result.baseUrl).toBe('https://api.com');
    expect(result.params).toHaveLength(0);
  });

  it('should decode percent-encoded values', () => {
    const result = parseUrlParams('https://api.com?name=hello%20world&q=%26foo');
    expect(result.params[0].key).toBe('name');
    expect(result.params[0].value).toBe('hello world');
    expect(result.params[1].value).toBe('&foo');
  });

  it('should handle invalid percent-encoding gracefully', () => {
    const result = parseUrlParams('https://api.com?q=%ZZ');
    expect(result.params[0].value).toBe('%ZZ');
  });

  it('should ignore hash fragment', () => {
    const result = parseUrlParams('https://api.com?a=1#section');
    expect(result.params).toHaveLength(1);
    expect(result.params[0]).toMatchObject({ key: 'a', value: '1' });
  });

  it('should skip ? inside {{ }} template variables', () => {
    const result = parseUrlParams('{{baseUrl}}?page=1');
    expect(result.baseUrl).toBe('{{baseUrl}}');
    expect(result.params).toHaveLength(1);
    expect(result.params[0]).toMatchObject({ key: 'page', value: '1' });
  });

  it('should not treat ? inside nested {{ }} as query start', () => {
    const result = parseUrlParams('https://api.com/{{path?fallback}}/items');
    expect(result.baseUrl).toBe('https://api.com/{{path?fallback}}/items');
    expect(result.params).toHaveLength(0);
  });

  it('should assign unique IDs to each param', () => {
    const result = parseUrlParams('https://api.com?a=1&b=2');
    expect(result.params[0].id).toBeTruthy();
    expect(result.params[1].id).toBeTruthy();
    expect(result.params[0].id).not.toBe(result.params[1].id);
  });

  it('should handle empty string', () => {
    const result = parseUrlParams('');
    expect(result.baseUrl).toBe('');
    expect(result.params).toHaveLength(0);
  });
});

describe('buildDisplayUrl', () => {
  it('should return base URL when no enabled params', () => {
    expect(buildDisplayUrl('https://api.com', [])).toBe('https://api.com');
  });

  it('should return base URL when all params are disabled', () => {
    const params = [
      { key: 'page', value: '1', enabled: false },
    ];
    expect(buildDisplayUrl('https://api.com', params)).toBe('https://api.com');
  });

  it('should append enabled params with ?', () => {
    const params = [
      { key: 'page', value: '2', enabled: true },
      { key: 'size', value: '10', enabled: true },
    ];
    expect(buildDisplayUrl('https://api.com', params)).toBe('https://api.com?page=2&size=10');
  });

  it('should skip disabled params', () => {
    const params = [
      { key: 'page', value: '2', enabled: true },
      { key: 'secret', value: 'hidden', enabled: false },
      { key: 'size', value: '10', enabled: true },
    ];
    expect(buildDisplayUrl('https://api.com', params)).toBe('https://api.com?page=2&size=10');
  });

  it('should skip params with empty key', () => {
    const params = [
      { key: '', value: 'orphan', enabled: true },
      { key: 'page', value: '1', enabled: true },
    ];
    expect(buildDisplayUrl('https://api.com', params)).toBe('https://api.com?page=1');
  });

  it('should show just key when value is empty', () => {
    const params = [
      { key: 'verbose', value: '', enabled: true },
    ];
    expect(buildDisplayUrl('https://api.com', params)).toBe('https://api.com?verbose');
  });
});

describe('mergeParams', () => {
  it('should return parsed params when no existing params', () => {
    const parsed = [
      { id: 'new1', key: 'a', value: '1', enabled: true },
    ];
    const result = mergeParams([], parsed);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ key: 'a', value: '1' });
  });

  it('should preserve disabled params from existing list', () => {
    const existing = [
      { id: 'e1', key: 'enabled', value: '1', enabled: true },
      { id: 'd1', key: 'disabled', value: 'hidden', enabled: false },
    ];
    const parsed = [
      { id: 'new1', key: 'enabled', value: '2', enabled: true },
    ];
    const result = mergeParams(existing, parsed);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ key: 'enabled', value: '2' });
    expect(result[1]).toMatchObject({ id: 'd1', key: 'disabled', enabled: false });
  });

  it('should reuse IDs from existing enabled params by position', () => {
    const existing = [
      { id: 'keep-me', key: 'page', value: '1', enabled: true },
      { id: 'keep-me-too', key: 'size', value: '10', enabled: true },
    ];
    const parsed = [
      { id: 'temp1', key: 'page', value: '2', enabled: true },
      { id: 'temp2', key: 'size', value: '20', enabled: true },
    ];
    const result = mergeParams(existing, parsed);
    expect(result[0].id).toBe('keep-me');
    expect(result[0].value).toBe('2');
    expect(result[1].id).toBe('keep-me-too');
    expect(result[1].value).toBe('20');
  });

  it('should keep fresh IDs for new params beyond existing count', () => {
    const existing = [
      { id: 'e1', key: 'a', value: '1', enabled: true },
    ];
    const parsed = [
      { id: 'p1', key: 'a', value: '1', enabled: true },
      { id: 'p2', key: 'b', value: '2', enabled: true },
    ];
    const result = mergeParams(existing, parsed);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('e1');
    expect(result[1].id).toBe('p2');
  });

  it('should handle empty parsed params (all params removed from URL)', () => {
    const existing = [
      { id: 'e1', key: 'page', value: '1', enabled: true },
      { id: 'd1', key: 'secret', value: 'x', enabled: false },
    ];
    const result = mergeParams(existing, []);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: 'd1', key: 'secret', enabled: false });
  });
});
