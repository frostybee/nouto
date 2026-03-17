import { CookieJarService } from './CookieJarService';
import type { Cookie } from './CookieJarService';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('CookieJarService', () => {
  let service: CookieJarService;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = path.join(os.tmpdir(), `nouto-cookie-test-${Date.now()}`);
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

    it('should persist jar structure and reload', async () => {
      await service.createJar('Staging');
      const jars = await service.listJars();
      expect(jars).toHaveLength(2);

      // Reload
      const service2 = new CookieJarService(tmpDir);
      const jars2 = await service2.listJars();
      expect(jars2).toHaveLength(2);
      expect(jars2.find(j => j.name === 'Staging')).toBeTruthy();
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

  // --- Multi-Jar Tests ---

  describe('jar CRUD', () => {
    it('should create a default jar on first load', async () => {
      const jars = await service.listJars();
      expect(jars).toHaveLength(1);
      expect(jars[0].name).toBe('Default');
      expect(service.getActiveJarId()).toBe(jars[0].id);
    });

    it('should create a new jar', async () => {
      const jar = await service.createJar('Staging');
      expect(jar.name).toBe('Staging');
      expect(jar.cookies).toHaveLength(0);
      const jars = await service.listJars();
      expect(jars).toHaveLength(2);
    });

    it('should rename a jar', async () => {
      const jars = await service.listJars();
      await service.renameJar(jars[0].id, 'Production');
      const updated = await service.listJars();
      expect(updated[0].name).toBe('Production');
    });

    it('should delete a jar', async () => {
      const jar = await service.createJar('Temp');
      expect((await service.listJars())).toHaveLength(2);
      await service.deleteJar(jar.id);
      expect((await service.listJars())).toHaveLength(1);
    });

    it('should not delete the last jar', async () => {
      const jars = await service.listJars();
      await service.deleteJar(jars[0].id);
      expect((await service.listJars())).toHaveLength(1);
    });

    it('should switch active jar when current is deleted', async () => {
      const jar = await service.createJar('Staging');
      const defaultJarId = service.getActiveJarId()!;
      await service.setActiveJar(jar.id);
      expect(service.getActiveJarId()).toBe(jar.id);

      await service.deleteJar(jar.id);
      // Should fall back to the remaining jar
      expect(service.getActiveJarId()).toBe(defaultJarId);
    });

    it('should list jars with cookie counts', async () => {
      await service.storeFromResponse(
        { 'set-cookie': ['a=1', 'b=2'] as any },
        'https://example.com/'
      );
      const jars = await service.listJars();
      expect(jars[0].cookieCount).toBe(2);
    });
  });

  describe('jar switching and isolation', () => {
    it('should switch active jar', async () => {
      const staging = await service.createJar('Staging');
      const defaultId = service.getActiveJarId()!;

      // Store cookie in default jar
      await service.storeFromResponse(
        { 'set-cookie': 'default_cookie=yes' },
        'https://example.com/'
      );

      // Switch to staging
      await service.setActiveJar(staging.id);
      expect(service.getActiveJarId()).toBe(staging.id);

      // Staging should be empty
      const cookies = await service.getAll();
      expect(cookies).toHaveLength(0);

      // Store a cookie in staging
      await service.storeFromResponse(
        { 'set-cookie': 'staging_cookie=yes' },
        'https://example.com/'
      );
      const stagingCookies = await service.getAll();
      expect(stagingCookies).toHaveLength(1);
      expect(stagingCookies[0].name).toBe('staging_cookie');

      // Switch back to default
      await service.setActiveJar(defaultId);
      const defaultCookies = await service.getAll();
      expect(defaultCookies).toHaveLength(1);
      expect(defaultCookies[0].name).toBe('default_cookie');
    });

    it('should build cookie header only from active jar', async () => {
      const staging = await service.createJar('Staging');

      // Store in default jar
      await service.storeFromResponse(
        { 'set-cookie': 'from_default=yes' },
        'https://example.com/'
      );

      // Switch to staging
      await service.setActiveJar(staging.id);

      // Should not get default jar's cookies
      const header = await service.buildCookieHeader('https://example.com/');
      expect(header).toBe('');
    });

    it('clearAll should only clear active jar', async () => {
      const staging = await service.createJar('Staging');
      const defaultId = service.getActiveJarId()!;

      // Store cookies in default
      await service.storeFromResponse(
        { 'set-cookie': 'a=1' },
        'https://example.com/'
      );

      // Switch and store in staging
      await service.setActiveJar(staging.id);
      await service.storeFromResponse(
        { 'set-cookie': 'b=2' },
        'https://example.com/'
      );

      // Clear staging
      await service.clearAll();
      expect(await service.getAll()).toHaveLength(0);

      // Default still has its cookie
      await service.setActiveJar(defaultId);
      expect(await service.getAll()).toHaveLength(1);
    });
  });

  describe('addCookie and updateCookie', () => {
    it('should add a cookie manually', async () => {
      const cookie: Cookie = {
        name: 'manual',
        value: 'test',
        domain: 'example.com',
        path: '/',
        httpOnly: false,
        secure: false,
        createdAt: Date.now(),
      };
      await service.addCookie(cookie);
      const all = await service.getAll();
      expect(all).toHaveLength(1);
      expect(all[0].name).toBe('manual');
    });

    it('should replace existing cookie on add with same key', async () => {
      const cookie1: Cookie = {
        name: 'dup', value: 'old', domain: 'example.com', path: '/',
        httpOnly: false, secure: false, createdAt: Date.now(),
      };
      const cookie2: Cookie = {
        name: 'dup', value: 'new', domain: 'example.com', path: '/',
        httpOnly: false, secure: false, createdAt: Date.now(),
      };
      await service.addCookie(cookie1);
      await service.addCookie(cookie2);
      const all = await service.getAll();
      expect(all).toHaveLength(1);
      expect(all[0].value).toBe('new');
    });

    it('should update an existing cookie', async () => {
      await service.storeFromResponse(
        { 'set-cookie': 'token=old' },
        'https://example.com/'
      );
      const updated: Cookie = {
        name: 'token', value: 'updated', domain: 'example.com', path: '/',
        httpOnly: true, secure: true, createdAt: Date.now(),
      };
      await service.updateCookie('token', 'example.com', '/', updated);
      const all = await service.getAll();
      expect(all).toHaveLength(1);
      expect(all[0].value).toBe('updated');
      expect(all[0].httpOnly).toBe(true);
      expect(all[0].secure).toBe(true);
    });
  });

  describe('migration from old format', () => {
    it('should migrate flat Cookie[] to multi-jar format', async () => {
      // Write old format directly
      const oldCookies = [
        { name: 'legacy', value: 'cookie', domain: 'example.com', path: '/',
          httpOnly: false, secure: false, createdAt: Date.now() },
      ];
      const filePath = path.join(tmpDir, 'cookies.json');
      fs.writeFileSync(filePath, JSON.stringify(oldCookies));

      // Load with new service
      const migrated = new CookieJarService(tmpDir);
      const jars = await migrated.listJars();
      expect(jars).toHaveLength(1);
      expect(jars[0].name).toBe('Default');
      expect(jars[0].cookieCount).toBe(1);

      const cookies = await migrated.getAll();
      expect(cookies).toHaveLength(1);
      expect(cookies[0].name).toBe('legacy');

      // Verify file was migrated to new format
      const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      expect(raw.jars).toBeDefined();
      expect(Array.isArray(raw.jars)).toBe(true);
    });

    it('should handle empty old format', async () => {
      const filePath = path.join(tmpDir, 'cookies.json');
      fs.writeFileSync(filePath, JSON.stringify([]));

      const migrated = new CookieJarService(tmpDir);
      const jars = await migrated.listJars();
      // Empty array migrated to default jar with empty array, then ensureLoaded creates default
      expect(jars).toHaveLength(1);
      expect(jars[0].name).toBe('Default');
    });
  });
});
