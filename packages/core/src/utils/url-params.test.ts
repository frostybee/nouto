import { parsePathParams, substitutePathParams, mergePathParams } from './url-params';
import type { PathParam } from '../types';
import { generateId } from '../types';

function makeParam(key: string, value = '', opts?: Partial<PathParam>): PathParam {
  return { id: generateId(), key, value, description: '', enabled: true, ...opts };
}

describe('parsePathParams', () => {
  it('should return empty array for URL without path params', () => {
    expect(parsePathParams('https://api.example.com/users')).toEqual([]);
  });

  it('should extract {param} syntax', () => {
    expect(parsePathParams('https://api.com/users/{userId}')).toEqual(['userId']);
  });

  it('should extract multiple {param} placeholders', () => {
    expect(parsePathParams('https://api.com/users/{userId}/posts/{postId}')).toEqual(['userId', 'postId']);
  });

  it('should NOT extract {{envVar}} double-brace syntax', () => {
    expect(parsePathParams('{{baseUrl}}/users/{id}')).toEqual(['id']);
  });

  it('should NOT extract {{envVar}} without path params', () => {
    expect(parsePathParams('{{baseUrl}}/users')).toEqual([]);
  });

  it('should extract :param syntax', () => {
    expect(parsePathParams('https://api.com/users/:userId')).toEqual(['userId']);
  });

  it('should extract multiple :param placeholders', () => {
    expect(parsePathParams('https://api.com/users/:userId/posts/:postId')).toEqual(['userId', 'postId']);
  });

  it('should NOT match port numbers as :param', () => {
    expect(parsePathParams('http://localhost:8080/users/:id')).toEqual(['id']);
  });

  it('should NOT match port numbers without path params', () => {
    expect(parsePathParams('http://localhost:3000/users')).toEqual([]);
  });

  it('should extract both {param} and :param in same URL', () => {
    expect(parsePathParams('https://api.com/{version}/users/:userId')).toEqual(['version', 'userId']);
  });

  it('should deduplicate names across both syntaxes', () => {
    expect(parsePathParams('https://api.com/{id}/related/:id')).toEqual(['id']);
  });

  it('should handle :param at end of URL', () => {
    expect(parsePathParams('https://api.com/users/:id')).toEqual(['id']);
  });

  it('should handle :param before query string', () => {
    expect(parsePathParams('https://api.com/users/:id?page=1')).toEqual(['id']);
  });

  it('should handle :param with underscores', () => {
    expect(parsePathParams('https://api.com/users/:user_id')).toEqual(['user_id']);
  });

  it('should handle {param} with spaces (trimmed)', () => {
    expect(parsePathParams('https://api.com/{ userId }')).toEqual(['userId']);
  });

  it('should return empty array for empty string', () => {
    expect(parsePathParams('')).toEqual([]);
  });

  it('should handle URL with no protocol', () => {
    expect(parsePathParams('api.com/users/{id}')).toEqual(['id']);
  });
});

describe('substitutePathParams', () => {
  it('should replace {param} with value', () => {
    const params = [makeParam('id', '123')];
    expect(substitutePathParams('https://api.com/users/{id}', params)).toBe('https://api.com/users/123');
  });

  it('should replace :param with value', () => {
    const params = [makeParam('id', '123')];
    expect(substitutePathParams('https://api.com/users/:id', params)).toBe('https://api.com/users/123');
  });

  it('should replace multiple params', () => {
    const params = [makeParam('userId', '42'), makeParam('postId', '99')];
    expect(substitutePathParams('https://api.com/users/{userId}/posts/{postId}', params))
      .toBe('https://api.com/users/42/posts/99');
  });

  it('should NOT replace disabled params', () => {
    const params = [makeParam('id', '123', { enabled: false })];
    expect(substitutePathParams('https://api.com/users/{id}', params)).toBe('https://api.com/users/{id}');
  });

  it('should NOT replace params with empty value', () => {
    const params = [makeParam('id', '')];
    expect(substitutePathParams('https://api.com/users/{id}', params)).toBe('https://api.com/users/{id}');
  });

  it('should NOT replace {{envVar}} syntax', () => {
    const params = [makeParam('baseUrl', 'https://prod.api.com')];
    expect(substitutePathParams('{{baseUrl}}/users/{id}', params)).toBe('{{baseUrl}}/users/{id}');
  });

  it('should replace both {param} and :param for same key', () => {
    const params = [makeParam('id', '123')];
    expect(substitutePathParams('https://api.com/{id}/related/:id', params)).toBe('https://api.com/123/related/123');
  });

  it('should handle :param at end of URL', () => {
    const params = [makeParam('id', '42')];
    expect(substitutePathParams('https://api.com/users/:id', params)).toBe('https://api.com/users/42');
  });

  it('should handle :param before query string', () => {
    const params = [makeParam('id', '42')];
    expect(substitutePathParams('https://api.com/users/:id?page=1', params)).toBe('https://api.com/users/42?page=1');
  });

  it('should not replace partial matches for :param', () => {
    const params = [makeParam('id', '42')];
    // :idSuffix should NOT be matched by :id
    expect(substitutePathParams('https://api.com/users/:idSuffix', params)).toBe('https://api.com/users/:idSuffix');
  });

  it('should return URL unchanged when no params', () => {
    expect(substitutePathParams('https://api.com/users/{id}', [])).toBe('https://api.com/users/{id}');
  });
});

describe('mergePathParams', () => {
  it('should create new params for parsed names with no existing', () => {
    const result = mergePathParams([], ['userId', 'postId']);
    expect(result).toHaveLength(2);
    expect(result[0].key).toBe('userId');
    expect(result[0].value).toBe('');
    expect(result[0].enabled).toBe(true);
    expect(result[1].key).toBe('postId');
  });

  it('should preserve existing param values when key matches', () => {
    const existing = [makeParam('id', '123', { description: 'User ID' })];
    const result = mergePathParams(existing, ['id']);
    expect(result).toHaveLength(1);
    expect(result[0].key).toBe('id');
    expect(result[0].value).toBe('123');
    expect(result[0].description).toBe('User ID');
  });

  it('should add new params and keep existing ones', () => {
    const existing = [makeParam('userId', '42')];
    const result = mergePathParams(existing, ['userId', 'postId']);
    expect(result).toHaveLength(2);
    expect(result[0].key).toBe('userId');
    expect(result[0].value).toBe('42');
    expect(result[1].key).toBe('postId');
    expect(result[1].value).toBe('');
  });

  it('should keep manually added params not in URL', () => {
    const existing = [makeParam('userId', '42'), makeParam('custom', 'val')];
    const result = mergePathParams(existing, ['userId']);
    expect(result).toHaveLength(2);
    expect(result[0].key).toBe('userId');
    expect(result[1].key).toBe('custom');
  });

  it('should remove params when parsed names shrinks', () => {
    const existing = [makeParam('userId', '42'), makeParam('postId', '99')];
    const result = mergePathParams(existing, ['userId']);
    // postId is kept as "manually added" by mergePathParams
    expect(result).toHaveLength(2);
    expect(result[0].key).toBe('userId');
  });

  it('should return empty array when no names and no existing', () => {
    expect(mergePathParams([], [])).toEqual([]);
  });

  it('should preserve param IDs for existing matches', () => {
    const existing = [makeParam('id', '123')];
    const existingId = existing[0].id;
    const result = mergePathParams(existing, ['id']);
    expect(result[0].id).toBe(existingId);
  });

  it('should reorder params to match parsed names order', () => {
    const existing = [makeParam('postId', '99'), makeParam('userId', '42')];
    const result = mergePathParams(existing, ['userId', 'postId']);
    expect(result[0].key).toBe('userId');
    expect(result[1].key).toBe('postId');
  });
});
