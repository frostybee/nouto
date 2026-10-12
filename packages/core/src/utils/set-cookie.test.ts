import { splitSetCookieHeader } from './set-cookie';

describe('splitSetCookieHeader', () => {
  it('returns a single cookie unchanged', () => {
    expect(splitSetCookieHeader('session=abc; Path=/; HttpOnly')).toEqual(['session=abc; Path=/; HttpOnly']);
  });

  it('splits cookies joined with a comma and a space', () => {
    expect(splitSetCookieHeader('a=1; Path=/; HttpOnly, b=2; Path=/')).toEqual([
      'a=1; Path=/; HttpOnly',
      'b=2; Path=/',
    ]);
  });

  it('splits cookies joined with a newline from redirect hops', () => {
    expect(splitSetCookieHeader('a=1; Path=/\nb=2; Path=/, c=3')).toEqual(['a=1; Path=/', 'b=2; Path=/', 'c=3']);
  });

  it('keeps the comma inside an Expires date', () => {
    const value = 'a=1; Expires=Wed, 09 Jun 2021 10:18:14 GMT; Path=/, b=2';
    expect(splitSetCookieHeader(value)).toEqual(['a=1; Expires=Wed, 09 Jun 2021 10:18:14 GMT; Path=/', 'b=2']);
  });

  it('splits before names with hyphens and dots', () => {
    expect(splitSetCookieHeader('XSRF-TOKEN=x; Path=/, connect.sid=s%3Aabc; HttpOnly')).toEqual([
      'XSRF-TOKEN=x; Path=/',
      'connect.sid=s%3Aabc; HttpOnly',
    ]);
  });

  it('drops empty parts', () => {
    expect(splitSetCookieHeader('')).toEqual([]);
    expect(splitSetCookieHeader('a=1\n\n')).toEqual(['a=1']);
  });
});
