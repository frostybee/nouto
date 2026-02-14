import { CookieJarService } from './CookieJarService';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('CookieJarService', () => {
  let service: CookieJarService;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = path.join(os.tmpdir(), `hivefetch-cookie-test-${Date.now()}`);
    fs.mkdirSync(tmpDir, { recursive: true });
    service = new CookieJarService(tmpDir);
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  describe('parseSetCookie', () => {
    const baseUrl = new URL('https://example.com/api');

    it('should parse a simple cookie', () => {
      const cookie = service.parseSetCookie('session=abc123', baseUrl);
      expect(cookie).toBeTruthy();
      expect(cookie!.name).toBe('session');
      expect(cookie!.value).toBe('abc123');
      expect(cookie!.domain).toBe('example.com');
    });

    it('should parse cookie with domain attribute', () => {
      const cookie = service.parseSetCookie('token=xyz; Domain=.example.com', baseUrl);
      expect(cookie!.domain).toBe('example.com');
    });

    it('should parse cookie with path attribute', () => {
      const cookie = service.parseSetCookie('id=1; Path=/api', baseUrl);
      expect(cookie!.path).toBe('/api');
    });

    it('should parse HttpOnly flag', () => {
      const cookie = service.parseSetCookie('session=abc; HttpOnly', baseUrl);
      expect(cookie!.httpOnly).toBe(true);
    });

    it('should parse Secure flag', () => {
      const cookie = service.parseSetCookie('session=abc; Secure', baseUrl);
      expect(cookie!.secure).toBe(true);
    });

    it('should parse SameSite attribute', () => {
      const cookie = service.parseSetCookie('session=abc; SameSite=Strict', baseUrl);
      expect(cookie!.sameSite).toBe('Strict');
    });

    it('should parse Expires attribute', () => {
      const cookie = service.parseSetCookie('session=abc; Expires=Wed, 09 Jun 2025 10:18:14 GMT', baseUrl);
      expect(cookie!.expires).toBeDefined();
      expect(cookie!.expires).toBeGreaterThan(0);
    });

    it('should parse Max-Age attribute', () => {
      const now = Date.now();
      const cookie = service.parseSetCookie('session=abc; Max-Age=3600', baseUrl);
      expect(cookie!.expires).toBeGreaterThan(now);
      expect(cookie!.expires! - now).toBeGreaterThanOrEqual(3500000); // ~1hr
    });

    it('should return null for invalid cookie', () => {
      expect(service.parseSetCookie('', baseUrl)).toBeNull();
      expect(service.parseSetCookie('=noname', baseUrl)).toBeNull();
    });
  });

  describe('storeFromResponse + getCookiesForUrl', () => {
    it('should store and retrieve cookies', async () => {
      await service.storeFromResponse(
        { 'set-cookie': 'session=abc123; Path=/' },
        'https://example.com/api'
      );
      const cookies = await service.getCookiesForUrl('https://example.com/page');
      expect(cookies).toHaveLength(1);
      expect(cookies[0].name).toBe('session');
      expect(cookies[0].value).toBe('abc123');
    });

    it('should handle multiple Set-Cookie headers as array', async () => {
      await service.storeFromResponse(
        { 'set-cookie': ['a=1', 'b=2'] as any },
        'https://example.com/'
      );
      const cookies = await service.getCookiesForUrl('https://example.com/');
      expect(cookies).toHaveLength(2);
    });

    it('should replace existing cookie with same name/domain/path', async () => {
      await service.storeFromResponse(
        { 'set-cookie': 'token=old' },
        'https://example.com/'
      );
      await service.storeFromResponse(
        { 'set-cookie': 'token=new' },
        'https://example.com/'
      );
      const cookies = await service.getCookiesForUrl('https://example.com/');
      expect(cookies).toHaveLength(1);
      expect(cookies[0].value).toBe('new');
    });

    it('should not return expired cookies', async () => {
      await service.storeFromResponse(
        { 'set-cookie': 'expired=yes; Max-Age=0' },
        'https://example.com/'
      );
      const cookies = await service.getCookiesForUrl('https://example.com/');
      expect(cookies).toHaveLength(0);
    });

    it('should not return secure cookies for http URLs', async () => {
      await service.storeFromResponse(
        { 'set-cookie': 'secure=yes; Secure' },
        'https://example.com/'
      );
      const httpCookies = await service.getCookiesForUrl('http://example.com/');
      expect(httpCookies).toHaveLength(0);
      const httpsCookies = await service.getCookiesForUrl('https://example.com/');
      expect(httpsCookies).toHaveLength(1);
    });

    it('should match subdomains', async () => {
      await service.storeFromResponse(
        { 'set-cookie': 'shared=yes; Domain=example.com' },
        'https://api.example.com/'
      );
      const cookies = await service.getCookiesForUrl('https://www.example.com/');
      expect(cookies).toHaveLength(1);
    });

    it('should respect path matching', async () => {
      await service.storeFromResponse(
        { 'set-cookie': 'api=yes; Path=/api' },
        'https://example.com/api/users'
      );
      const apiCookies = await service.getCookiesForUrl('https://example.com/api/users');
      expect(apiCookies).toHaveLength(1);
      const rootCookies = await service.getCookiesForUrl('https://example.com/');
      expect(rootCookies).toHaveLength(0);
    });
  });

  describe('buildCookieHeader', () => {
    it('should build Cookie header string', async () => {
      await service.storeFromResponse(
        { 'set-cookie': ['a=1', 'b=2'] as any },
        'https://example.com/'
      );
      const header = await service.buildCookieHeader('https://example.com/');
      expect(header).toBe('a=1; b=2');
    });

    it('should return empty string for no matching cookies', async () => {
      const header = await service.buildCookieHeader('https://unknown.com/');
      expect(header).toBe('');
    });
  });

  describe('deletion', () => {
    beforeEach(async () => {
      await service.storeFromResponse(
        { 'set-cookie': ['a=1', 'b=2'] as any },
        'https://example.com/'
      );
      await service.storeFromResponse(
        { 'set-cookie': 'c=3' },
        'https://other.com/'
      );
    });

    it('should delete a specific cookie', async () => {
      await service.deleteCookie('a', 'example.com', '/');
      const cookies = await service.getAll();
      expect(cookies).toHaveLength(2);
      expect(cookies.find(c => c.name === 'a')).toBeUndefined();
    });

    it('should delete all cookies for a domain', async () => {
      await service.deleteDomain('example.com');
      const cookies = await service.getAll();
      expect(cookies).toHaveLength(1);
      expect(cookies[0].domain).toBe('other.com');
    });

    it('should clear all cookies', async () => {
      await service.clearAll();
      const cookies = await service.getAll();
      expect(cookies).toHaveLength(0);
    });
  });

  describe('getAllByDomain', () => {
    it('should group cookies by domain', async () => {
      await service.storeFromResponse(
        { 'set-cookie': ['a=1', 'b=2'] as any },
        'https://example.com/'
      );
      await service.storeFromResponse(
        { 'set-cookie': 'c=3' },
        'https://other.com/'
      );
      const grouped = await service.getAllByDomain();
      expect(Object.keys(grouped)).toHaveLength(2);
      expect(grouped['example.com']).toHaveLength(2);
      expect(grouped['other.com']).toHaveLength(1);
    });
  });

  describe('persistence', () => {
    it('should persist cookies to file and reload', async () => {
      await service.storeFromResponse(
        { 'set-cookie': 'session=abc' },
        'https://example.com/'
      );

      // Create a new service instance pointing to same dir
      const service2 = new CookieJarService(tmpDir);
      const cookies = await service2.getAll();
      expect(cookies).toHaveLength(1);
      expect(cookies[0].name).toBe('session');
    });
  });

  describe('edge cases', () => {
    it('should handle invalid URL gracefully', async () => {
      await service.storeFromResponse(
        { 'set-cookie': 'a=1' },
        'not-a-valid-url'
      );
      const cookies = await service.getAll();
      expect(cookies).toHaveLength(0);
    });

    it('should handle empty response headers', async () => {
      await service.storeFromResponse({}, 'https://example.com/');
      const cookies = await service.getAll();
      expect(cookies).toHaveLength(0);
    });

    it('should return empty for invalid getCookiesForUrl URL', async () => {
      const cookies = await service.getCookiesForUrl('not-valid');
      expect(cookies).toHaveLength(0);
    });
  });
});
